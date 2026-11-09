import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0171 (the security review of 3 Nov 2026): the review's fixes in the database, one drained step. These read the migration's text, its loader, its manifest and
 * the books: the n1 lines; that an earlier body changes only through the patch inventory, each anchor standing in that function's last definition as often as the
 * inventory says; that every earlier function it changes, its grants included, is declared against every chain step whose postcondition digests it, and
 * that it changes none the two steps before the chain pin; who may call each new function, and that no role holds its new table; what is taken back and
 * where the books record it; that no earlier function still reads or sets a forget setting (F4a); and that the contract block names each fix. The lists
 * below are the step's whole, F2 to F5: once it is applied anywhere, a later change is a step of its own. What the fixes do on real PostgreSQL is
 * tests/integration/security-review-hardening-database.test.ts's.
 */
const NAME = "0171_security_review_hardening.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/security-review-hardening-forward0171.json";
const LOADER_PATH = "packages/db/src/migration-forward0171.ts";
const PREVIOUS = "0170_outbound_mail_limit.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/outbound-mail-limit-forward0170.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
/** One spelling a signature: no whitespace, and timestamptz for its long name, which 0110's manifest spells out. */
const plain = (signature: string): string => signature.replace(/\btimestamp with time zone\b/gu, "timestamptz").replace(/\s+/gu, "");

/** Every role a 0131-to-0153 step refuses by name, beside PUBLIC. The request-facing roles are all here. */
const ROLES = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker"] as const;

/** The functions this step adds, each with the fix it serves and the one role its grant names (null: no role may call it; only its owner's definers do). */
const ADDED = [
  { fix: "F4b", signature: "core.publication_is_current(uuid)", grantee: "debateai_staff_security_owner" },
  { fix: "F4a", signature: "identity.open_forget_scope(text)", grantee: null },
  { fix: "F4a", signature: "identity.close_forget_scope(text)", grantee: null },
  { fix: "F4a", signature: "identity.forget_scope_open(text)", grantee: null },
  { fix: "F5", signature: "identity.request_owner_matches(uuid)", grantee: "debateai_staff_security_owner" },
  { fix: "F5", signature: "identity.reserve_ask_clarify_charge(uuid,uuid)", grantee: "debateai_runtime" },
  { fix: "F2", signature: "identity.run_is_dig(uuid)", grantee: null },
  { fix: "F2", signature: "identity.read_run_is_dig(uuid,uuid)", grantee: "debateai_billing_runtime" },
  // The API's hourly sweep of the clarify reservations no charge took: no owner, any account's rows, so the marker's alone.
  { fix: "F5", signature: "identity.delete_ask_clarify_reservations_due(integer)", grantee: "debateai_rls_all_accounts" },
  // The Report button's limits as the site holds them (the CURRENT release's sealed abuseLimits row): only 0151's opening asks it, as its owner.
  { fix: "F5", signature: "identity.public_flag_site_limits()", grantee: null },
  // A verification mail's delivery, recorded only for the token that mail carried: a same-name overload of 0085's, which stays (nothing is dropped),
  // taken back from the request login (TAKEN); the API records each delivery through it, inside the request that sent the mail.
  { fix: "F5", signature: "identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb)", grantee: "debateai_runtime",
    overloads: "0085_staff_access_foundation.sql" }
] as const;
/** The step whose function a new one overloads by name, for the one ADDED that does; every other adds a name no earlier step defines. */
const overloadOf = (added: (typeof ADDED)[number]): string | undefined => "overloads" in added ? added.overloads : undefined;
/**
 * F5: how long a clarify call's reservation names its person. The API records a call within a minute of reserving it (its 8-second deadline aborts
 * the call, the pool waits 5 s at most for a connection, production ends a statement at 30 s), so an hour is ample, and a reservation made with a token
 * stolen and then revoked names no one past it. The writer's take, the reservation's prune and the API's sweep must use this one literal, so the sweep
 * never takes a row the writer would still honour.
 */
const CLARIFY_WINDOW = "interval '1 hour'";
/**
 * F5: 0144's charge writer, right before its person's row, after the ledger row it always writes: the call's reservation for this very owner, taken
 * as it is used and no older than the window (its time is when the call was admitted), or else, with none, the owner it is handed (and then now): it
 * asks nothing of the connection, as an owner question after the paid call could only leave the call out of its person's quota. The grant the API
 * names is kept only when it is that person's own, by its configured event, and was running at that time; any other is dropped, so the row is the
 * person's own plan's. It refuses nothing, so no paid call goes uncounted and nothing latches the API's breaker.
 */
const PERSON_DECLARE = { old: "  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;\nBEGIN\n",
  new: "  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;\n  v_admitted timestamptz;\nBEGIN\n", count: 1 } as const;
const PERSON_ANCHOR = "  BEGIN\n    INSERT INTO identity.ask_clarify_charge";
const PERSON_GUARD = [
  "  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id = p_charge_id AND reservation.owner_ref = p_owner\n",
  `    AND reservation.reserved_at > pg_catalog.clock_timestamp() - ${CLARIFY_WINDOW} RETURNING reservation.reserved_at INTO v_admitted;\n`,
  "  v_admitted := COALESCE(v_admitted, pg_catalog.clock_timestamp());\n",
  "  IF NOT EXISTS (SELECT 1 FROM billing.internal_grant AS grant_row WHERE grant_row.grant_id = p_grant AND grant_row.configured_event_id = p_event\n",
  "      AND grant_row.owner_ref = p_owner AND grant_row.starts_at <= v_admitted AND grant_row.expires_at > v_admitted\n",
  "      AND (grant_row.revoked_at IS NULL OR grant_row.revoked_at > v_admitted)) THEN\n",
  "    p_grant := NULL;\n",
  "    p_event := NULL;\n",
  "  END IF;\n"].join("");
/** The tables it adds: no role holds a right on any. */
const TABLES = [{ fix: "F4a", relation: "identity.private_forget_scope" }, { fix: "F5", relation: "identity.ask_clarify_reservation" },
  { fix: "F2", relation: "identity.dig_run" }] as const;
/** F5: what no code calls any more, taken back from the one role each was granted to. */
const TAKEN = [
  { signature: "identity.join_investigation(uuid,uuid,uuid,text[],text)", role: "debateai_billing_runtime" },
  { signature: "identity.close_investigation(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.read_investigation(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)", role: "debateai_billing_runtime" },
  { signature: "identity.read_reserve(uuid)", role: "debateai_runtime" },
  { signature: "identity.wipe_inactive_web_page_text(integer)", role: "debateai_runtime" },
  { signature: "identity.read_investigation_dig_levels(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.read_path_rewrites(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.read_paused_runs(uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.read_public_report_spent(uuid,timestamptz,timestamptz)", role: "debateai_runtime" },
  { signature: "identity.read_path_line(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.read_main_answer_updates(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.close_public_investigation(uuid,uuid)", role: "debateai_billing_runtime" },
  { signature: "identity.reopen_public_investigation(uuid,integer)", role: "debateai_runtime" },
  // 0133's mark of a closing's report: 0136's report writer marks it as its owner, and packages/db no longer offers it.
  { signature: "identity.record_investigation_report(uuid,integer,uuid)", role: "debateai_runtime" },
  // 0128's two keepers of a threat report, which name any account (or none) and alert staff: no code keeps one, and packages/db no longer offers them.
  { signature: "staff.keep_threat_report(text,uuid)", role: "debateai_runtime" },
  { signature: "staff.keep_threat_report_with_email(text,uuid,text)", role: "debateai_runtime" },
  // And the older ones no product code calls: 0046's reader of a recovery's risk signals, 0140's team spend sum (staff's month reader asks it as its
  // owner), and 0085's first staff ceremonies, which 0086's owned ceremony replaced (0094's owned assertion completes the last two as their owner).
  { signature: "identity.read_authentication_risk_signals_for_recovery(uuid)", role: "debateai_runtime" },
  { signature: "staff.read_team_internal_spent(timestamptz,timestamptz)", role: "debateai_runtime" },
  { signature: "staff.begin_invitation_challenge(uuid,uuid,text,text,text)", role: "debateai_runtime" },
  { signature: "staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text)", role: "debateai_runtime" },
  { signature: "staff.begin_registration_challenge(uuid,uuid,text,text)", role: "debateai_runtime" },
  { signature: "staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text)", role: "debateai_runtime" },
  { signature: "staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text)", role: "debateai_runtime" },
  // 0085's record of a verification mail's delivery, which took any account's user id and wrote its delivery state and audit event: the API records
  // each delivery through the overload that names the mail's own token (ADDED); this one stays, for no role.
  { signature: "identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)", role: "debateai_runtime" }
] as const;
/**
 * F5: what is taken from one role and kept by the others that hold it: 0085's hold question, from debateai_runtime alone. The authorization runtime's
 * sign-in step-up asks it of its own session's user row, and the owners of the definers that ask it keep theirs; the contract checks both.
 */
const NARROWED = [{ signature: "identity.read_account_security_hold(uuid)", role: "debateai_runtime" }] as const;
/** F5: what only the runner or the API's sweeps call, moved from debateai_runtime to the cross-account marker. */
const MOVED = [
  "identity.read_web_page_texts(uuid,uuid[])",
  "identity.read_free_debates_to_publish(integer)",
  "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)",
  "identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
  "identity.read_web_reply_texts(uuid,uuid[])",
  "identity.read_public_material(uuid)",
  "identity.read_public_dig_input(uuid)",
  "identity.read_public_answer_updates(uuid)",
  "identity.read_public_reports_unwritten(integer)",
  "identity.read_public_checks_passed(integer)",
  "identity.read_public_page_owed(integer)",
  "identity.read_public_reports_owed(integer)",
  "identity.read_free_debate_owner(uuid)",
  "identity.delete_public_flag_words_due()",
  "identity.read_public_review_purge_due(integer)",
  "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)",
  // The sweeps' own steps, no owner either: their listers, settlements, wipes and marks, and the public page's writers of the API's sweep.
  "identity.settle_web_researched(uuid,uuid,text)",
  "identity.read_unwritten_path_rewrites(timestamptz,integer)",
  "identity.read_unreported_closings(integer)",
  "identity.settle_public_contribution(uuid,text,uuid)",
  "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)",
  "core.prepare_free_publication(uuid,uuid)",
  "core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)",
  "identity.refuse_free_publication(uuid)",
  "identity.read_debates_holding_passages(integer)",
  "identity.wipe_debate_passages(uuid,text)",
  "identity.wipe_inactive_web_page_text_of_idle_debates(integer)",
  "identity.read_unsettled_web_researched(integer)",
  "identity.read_public_digs_unsettled(timestamptz,integer)",
  "identity.read_public_climbs_owed(integer)",
  "identity.mark_public_climb_done(uuid)",
  "identity.record_public_check_passed(uuid,uuid)",
  "identity.record_public_page_skip(uuid,uuid,text,text)",
  "identity.record_public_debate_report(uuid,integer,uuid,jsonb)",
  "identity.mark_dig_tree_settled(uuid)",
  // The runner's own steps of one debate, keyed by its run, turn or report alone (its web evidence, rewrites, turns, pause, report and public dig
  // writers), and the readers only the runner or the API's system pool outside a request call.
  "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)",
  "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)",
  "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)",
  "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)",
  "identity.record_web_picks(uuid,text,uuid[])",
  "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)",
  "identity.read_dig_level_of_run(uuid)",
  "identity.take_path_rewrite_turn(uuid,uuid,text)",
  "identity.read_path_rewrite_turn(uuid)",
  "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)",
  "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)",
  "identity.read_run_pause_of_run(uuid)",
  "identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)",
  "identity.read_investigation_waiting_of_run(uuid)",
  "identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
  "identity.read_closing_since_of_root(uuid)",
  "identity.read_public_contribution_of_run(uuid)",
  "identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
  "identity.read_path_update_turn(uuid)",
  "identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.read_path_climb_next(uuid)",
  "identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)",
  "identity.record_web_reply_text(uuid,uuid,jsonb,bytea)",
  "identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)",
  "identity.run_work_is_parked(uuid,text,timestamptz)",
  "identity.record_public_dig_input(uuid,text,jsonb,bytea)",
  "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)",
  "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.read_public_climb_next(uuid)",
  "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
  "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
  "identity.read_public_report_charged_until(uuid)",
  "identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)",
  "identity.dig_is_settled(uuid)",
  // The engine's older steps of one debate only the runner or the API's system login calls: 0120's recorded facts (the runner's terminal
  // activation), 0040's evaluator call check (the runner's provider gateway; the evaluator worker keeps its own grant) and 0126's inheritance
  // writer (the API's check worker, from its gated timer).
  "core.read_terminal_recorded_facts(uuid)",
  "evaluator.provider_call_request_is_authorized(uuid,text,text,text)",
  "serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)",
  // Staff's notice and alert loops, which the API drains only from its gated timers, outside any request: 0128's threat report alerts (the
  // recipient, the erasure of the reports due, the claim and the completion), and the claim, completion and recipient of 0142's team limit notices,
  // 0146's allowance notices, 0150's public review notices and 0151's flag notices.
  "staff.threat_report_recipient_user(uuid)",
  "staff.erase_due_threat_reports()",
  "staff.claim_threat_report_alerts(integer)",
  "staff.complete_threat_report_alert(uuid,uuid,boolean)",
  "staff.claim_team_limit_notices(integer)",
  "staff.complete_team_limit_notice(uuid,uuid,boolean)",
  "staff.team_limit_notice_user(uuid,uuid)",
  "staff.claim_allowance_notices(integer)",
  "staff.complete_allowance_notice(uuid,uuid,boolean)",
  "staff.allowance_notice_user(uuid,uuid)",
  "staff.claim_public_review_notices(integer)",
  "staff.complete_public_review_notice(uuid,uuid,boolean)",
  "staff.public_review_notice_user(uuid,uuid)",
  "staff.claim_public_flag_notices(integer)",
  "staff.complete_public_flag_notice(uuid,uuid,boolean)",
  "staff.public_flag_notice_user(uuid,uuid)",
  // 0088's staff alert outbox, which the staff runtime's dispatcher drains from its gated timer: the claim, its key mapping, its settlement, the
  // queue's status and 0090's invitee channel. 0112's release stays debateai_runtime's, as 0112's verifier requires.
  "staff.claim_alert_delivery(integer)",
  "staff.read_alert_key_mapping(uuid,uuid)",
  "staff.settle_alert_delivery(uuid,uuid,text,text)",
  "staff.read_alert_delivery_status()",
  "staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)",
  // 0100's consumer security notice loop, which only the authorization pool's erasure reconciler drains, from its gated timer (MOVED_FROM).
  "identity.claim_consumer_security_notices(integer)",
  "identity.read_consumer_security_notice(uuid,uuid)",
  "identity.ack_consumer_security_notice(uuid,uuid)",
  "identity.fail_consumer_security_notice(uuid,uuid,text)",
  // The retention purges of what is due, which the API runs from its gated timers: 0080's from the API billing role (MOVED_FROM).
  "identity.purge_expired_authentication_risk_signals(integer)",
  "serve.purge_expired_synthesis_check_removal_notices()",
  "legal.purge_expired_acceptance(timestamptz)",
  // 0151's flag settlement, which believed the verdict it was handed: the API's press calls it after the judge, on its system login alone (X38).
  "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)",
  // Staff's ceremonies and changes, which the API calls only through its staff repository on its system login (X14): 0085's grant, acceptance and
  // capability check, 0086's owned key ceremony and key reader, and 0088's user mapping, which a staff change's alert intent asks through the same site.
  'staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb)',
  "staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb)",
  "staff.authorize_action(jsonb,text)",
  "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)",
  "staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb)",
  "staff.fail_owned_webauthn(uuid,uuid,uuid)",
  "staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)",
  "staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)",
  "identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)",
  "staff.read_alert_user_mapping(uuid)",
  // The three writers of the site's day that name no debate, which took any caller and any amount: the API records each paid call through its site
  // on its system login (X30 the language check, X31 the question check, X32 the clarify charge), inside the request that paid for it.
  "ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)",
  "ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)",
  "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)",
  // The sign-in and recovery functions that hand out what proves a person, or open a session on the API's word, before any session: 0098's stored
  // passkey credential and its sign-in completion (0099's body), 0100's stored recovery proof and its proof (0112's body). A request login begins its
  // own challenge or recovery with a token of its choosing, so no secret it is handed gates them; the API calls each only through its repositories,
  // on its system login (X36). And 0040's use of a saved recovery code (0112's body), which marks any account's code used, through the same site.
  "identity.read_consumer_passkey_credential(text,text,text)",
  "identity.complete_consumer_passkey_login(jsonb,jsonb)",
  "identity.read_consumer_recovery_proof(text,integer)",
  "identity.prove_consumer_recovery(jsonb,jsonb)",
  "identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)",
  // 0048's writer of a provider's probe, which took any caller and any date, though the API's ask-time discovery trusts a provider's latest row: the
  // API records each probe its discovery makes through its site on its system login (X37), inside the asking request; the runner holds the marker.
  "core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)"
] as const;
/**
 * F5: the day's own tables, whose INSERT moves from debateai_runtime to the marker (a request login wrote a charge of any size on a debate of its own,
 * a hold, or a reservation of any day that never expires), and 0000's sequence counter, whose UPDATE is taken back as its allocator becomes a definer.
 */
const DAY_TABLES = ["ledger.model_spend", "ledger.model_spend_hold", "ledger.model_spend_reservation"] as const;
const TABLE_REVOKED = [...DAY_TABLES.map((relation) => `INSERT ON ${relation}`), "UPDATE ON ledger.sequence_allocator"] as const;
/** The role each move takes its grant from, where that is not debateai_runtime: the consumer loop's authorization runtime and 0080's billing role. */
const MOVED_FROM: Readonly<Record<string, string>> = Object.freeze({
  "identity.claim_consumer_security_notices(integer)": "debateai_authorization_runtime",
  "identity.read_consumer_security_notice(uuid,uuid)": "debateai_authorization_runtime",
  "identity.ack_consumer_security_notice(uuid,uuid)": "debateai_authorization_runtime",
  "identity.fail_consumer_security_notice(uuid,uuid,text)": "debateai_authorization_runtime",
  "legal.purge_expired_acceptance(timestamptz)": "debateai_billing_runtime",
  "identity.read_consumer_passkey_credential(text,text,text)": "debateai_authorization_runtime",
  "identity.complete_consumer_passkey_login(jsonb,jsonb)": "debateai_authorization_runtime",
  "identity.read_consumer_recovery_proof(text,integer)": "debateai_authorization_runtime",
  "identity.prove_consumer_recovery(jsonb,jsonb)": "debateai_authorization_runtime"
});
const movedFrom = (signature: string): string => MOVED_FROM[signature] ?? "debateai_runtime";
/** The grants it takes back: one role per line, in the file's order (F3's, F5's taken, F5's narrowed, F5's moved). */
const REVOKED = [
  { fix: "F3", signature: "identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)", role: "debateai_billing_runtime" },
  ...TAKEN.map(({ signature, role }) => ({ fix: "F5", signature, role })),
  ...NARROWED.map(({ signature, role }) => ({ fix: "F5", signature, role })),
  ...MOVED.map((signature) => ({ fix: "F5", signature, role: movedFrom(signature) }))
] as const;
/** The grants it makes: the new functions' (ADDED), then F5's moved ones, each to the marker. */
const GRANTED = [
  ...ADDED.flatMap(({ signature, grantee }) => grantee === null ? [] : [{ signature, grantee: grantee as string }]),
  ...MOVED.map((signature) => ({ signature, grantee: "debateai_rls_all_accounts" }))
] as const;
/** A run's latest owner, as 0126's own notice lookup reads it: the raw latest ownership event, so an erased run still reaches its erasure trigger. */
const OWNER_OF = (run: string): string =>
  `(SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = ${run} ORDER BY event.at_seq DESC LIMIT 1)`;
/**
 * F5: 0131's rule and the request-facing definers that ask, with what the question names and how each asks: as a rule, in a plain reader's WHERE
 * (the owner argument, or the member row's owner), as a refusal that is the body's first statement (0127's review state and 0144's and 0149's
 * spend totals, whose rows and totals are read as refusals and caps, become plpgsql for it). And the ones whose
 * argument is a run, a material or a flag: the run-keyed readers ask 0131's rule of the run's own owner where they asked only whether it was live
 * (the run argument), 0040's lock asks it of an owner it is handed beside its own ownership check, the engine's older run-keyed questions (0123's
 * unstarted re-admissions in their owner's branch, 0127's approval question) ask once of the run's latest owner, and
 * 0126's check result writer asks it once inside its attempt match (the run's owner, a row it reads), the public copy's writer refuses a copy that is
 * not the connection's own dig or open report (the run's owner, or the report's writer), the flag's opening refuses first and then counts against
 * the lower of the limits it is handed and the site's own, and the flag's settlement, the marker's alone now (MOVED), still closes or hides only for
 * the reporter's own connection or a marker login presenting no session (the flag's reporter), and hides nothing for a flag staff dismissed.
 */
const ASKING = [
  { signature: "core.lock_owned_live_runs(uuid[],uuid,text)", owner: "p_owner_ref", kind: "locks" },
  { signature: "core.list_unstarted_readmissions(uuid)", owner: OWNER_OF("p_old_run_id"), kind: "run_owner" },
  { signature: "serve.take_synthesis_check_removal_notice(uuid)", owner: "p_owner_ref", kind: "reader" },
  { signature: "serve.synthesis_check_removal_notice_exists(uuid)", owner: "p_owner_ref", kind: "reader" },
  { signature: "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)", owner: OWNER_OF("p_run_id"), kind: "attempt" },
  { signature: "serve.read_publication_review_state(uuid,uuid,uuid)", owner: "p_owner_ref", kind: "raises" },
  { signature: "serve.publication_review_approved(uuid,uuid,integer)", owner: OWNER_OF("p_run_id"), kind: "run_owner" },
  { signature: "identity.page_memory_run_owned(uuid,uuid)", owner: "p_owner_ref", kind: "rule" },
  { signature: "identity.read_page_reading_level(uuid)", owner: "p_owner_ref", kind: "reader" },
  { signature: "identity.save_page_reading_level(uuid,text)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.record_web_researched(uuid,uuid,uuid)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_web_evidence(uuid)", owner: "p_run_id", kind: "exported" },
  { signature: "identity.read_investigation_of_run(uuid)", owner: "member.owner_ref", kind: "member" },
  { signature: "identity.resume_paused_run(uuid,uuid)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_run_pause(uuid,uuid)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_path_rewrites_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_web_plan(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_dig_picks_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_investigation_reports_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.record_public_dig_picks(uuid,uuid,jsonb)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_run_purpose_lines(uuid,uuid)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_path_line_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_main_answer_updates_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_run_purpose_lines_of_run(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_web_shown_quotes(uuid)", owner: "p_run_id", kind: "run" },
  { signature: "identity.read_path_suggestions_of_run(uuid)", owner: "p_debate_run_id", kind: "run" },
  { signature: "identity.continue_paused_run_in_release(uuid,uuid,text,bigint)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)", owner: "p_owner", kind: "raises" },
  { signature: "identity.open_public_report(uuid,uuid,uuid,boolean)", owner: "p_owner_ref", kind: "refuses" },
  { signature: "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)", owner: "v_owner", kind: "material" },
  { signature: "identity.read_public_path_line(uuid)", owner: "identity.web_evidence_run_owner((entry.value->>'run_id')::uuid)", kind: "line" },
  { signature: "identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)", owner: "p_owner_ref", kind: "raises" },
  { signature: "identity.read_own_public_contributions(uuid,uuid)", owner: "p_owner_ref", kind: "reader" },
  { signature: "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)", owner: "p_owner_ref", kind: "opens" },
  { signature: "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)", owner: "v.reporter_ref", kind: "flag" }
] as const;
/**
 * F5: 0144's charge writer, which 0171 patches beside them (PERSON_GUARD) and which asks nothing of the connection: it is the marker's alone (MOVED),
 * called after its AI call was paid, and the call's reservation, made on the request's own login while the session was live, names the person.
 */
const CHARGE = { signature: "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)" } as const;
/** F5's request-facing entries in the inventory's step order: the ones that ask, and the charge writer at 0144's place among them. */
const REQUEST_FACING = ((at: number) => [...ASKING.slice(0, at), CHARGE, ...ASKING.slice(at)])(
  ASKING.findIndex(({ signature }) => signature === "identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)"));
/** The kinds whose question names an argument of the function's own; the others name a row it read (the member, the run's owner, the reporter). */
const ARGUMENT_KINDS: readonly string[] = ["rule", "reader", "refuses", "raises", "opens", "locks", "run", "exported"];
/**
 * F5: 0132's web evidence reader asks as the other run-keyed readers do, but keeps its liveness question for the export worker's login: 0132's export
 * reader calls it under that login's lease of one account's export, and no request role holds the worker's role.
 */
const EXPORTED_GUARD = "IF NOT (CASE WHEN pg_catalog.pg_has_role(session_user, 'debateai_data_export_worker', 'MEMBER') THEN identity.web_evidence_run_owner(p_run_id) IS NOT NULL\n"
  + "    ELSE identity.page_memory_run_owned(identity.web_evidence_run_owner(p_run_id), p_run_id) END) THEN RETURN NULL; END IF;";
/** A refusal as 0140's and 0107's bodies spell their own (no space before END IF). */
const REFUSAL = "RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH';END IF;";
/** The marker: what the API's system login and the runner's login hold, and no request login. */
const MARKER = "pg_catalog.pg_has_role(session_user, 'debateai_rls_all_accounts', 'MEMBER')";
/** The owner of an admitted call's run, whose grant the call charges: its charge scope's, which the admission found the call's grant in. */
const SCOPE_OWNER = "(SELECT scope.owner_ref FROM billing.run_charge_scope AS scope WHERE scope.run_id=v_call.run_id)";
/**
 * F5: the billing functions keyed by a run or an owner that the request logins may call, each with the step that last wrote it, the owner its question
 * names and its patches, in step order. 0130's verifier pins their grants, owners, definer flag and settings, never a body, so each asks in its body and
 * keeps all four (the patch block refuses a move): 0089's list of the owners billing stops keeps only the rows of an owner it is; 0092's grant of a
 * run and 0123's run state answer as for nothing stored, of the run's charge scope's owner, in the guard they had; 0092's
 * pin refuses a login without the marker first; 0107's settlement refuses unless the owner of the admitted call's run is the connection's, right
 * after it finds the call; 0123's person's grant answers nothing, after its clock check and before it locks the person; and 0140's admission refuses
 * unless the run's owner (its scope's, else its latest ownership event's) is the connection's, before it locks the owner or reads the grant. 0089's and
 * 0091's erasure and age questions and 0092's funding basis are refusals, left alone (REFUSALS_LEFT).
 */
const BILLING = [
  { signature: "billing.pending_erasure_owner_refs(uuid,integer)", step: "0089_billing_erasure_hook.sql", owner: "candidate.owner_ref", kind: "lists", patches: [
    { old: "  WHERE (p_after IS NULL OR candidate.owner_ref>p_after)\n",
      new: "  WHERE (p_after IS NULL OR candidate.owner_ref>p_after) AND identity.request_owner_matches(candidate.owner_ref)\n", count: 1 }] },
  { signature: "billing.read_internal_allowance_for_run(uuid,timestamptz)", step: "0092_internal_funded_allowance.sql", owner: "v_scope.owner_ref", kind: "nothing", patches: [
    { old: "IF NOT FOUND OR v_scope.funding_kind='SUBSCRIPTION' THEN RETURN NULL; END IF;",
      new: "IF NOT FOUND OR v_scope.funding_kind='SUBSCRIPTION' OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN NULL; END IF;", count: 1 }] },
  { signature: "billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)", step: "0092_internal_funded_allowance.sql", owner: null, kind: "marker", patches: [
    { old: "\nBEGIN\n", new: `\nBEGIN\n  IF NOT ${MARKER} THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n`, count: 1 }] },
  { signature: "billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)", step: "0107_auth_dev_integration.sql", owner: SCOPE_OWNER, kind: "refuses", patches: [
    { old: " IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REQUIRED';END IF;\n",
      new: ` IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REQUIRED';END IF;\n IF NOT identity.request_owner_matches(${SCOPE_OWNER}) THEN\n  ${REFUSAL}\n`, count: 1 }] },
  { signature: "billing.read_internal_run_state(uuid)", step: "0123_side_by_side_releases.sql", owner: "v_scope.owner_ref", kind: "nothing", patches: [
    { old: "IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' THEN RETURN 'UNAVAILABLE';END IF;",
      new: "IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' OR NOT identity.request_owner_matches(v_scope.owner_ref) THEN RETURN 'UNAVAILABLE';END IF;", count: 1 }] },
  { signature: "billing.read_internal_allowance(uuid,timestamptz)", step: "0123_side_by_side_releases.sql", owner: "p_owner", kind: "nothing", patches: [
    { old: "  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;\n",
      new: "  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;\n  IF NOT identity.request_owner_matches(p_owner) THEN RETURN NULL; END IF;\n", count: 1 }] },
  { signature: "billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)", step: "0140_internal_spend_kinds.sql", owner: "v_owner", kind: "refuses", patches: [
    { old: " IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;\n",
      new: " IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;\n"
        + ` IF NOT identity.request_owner_matches(v_owner) THEN ${REFUSAL}\n`, count: 1 }] }
] as const;
/** The one billing body a chain step's postcondition digests: 0140's admission; the others are older than the chain or 0123's restatements, which 0123's digest leaves out. */
const BILLING_PINNED = ["billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)"] as const;
/** The owner of the account a user id names, which a reader with no account row of its own asks of. */
const USER_OWNER = '(SELECT account.owner_ref FROM identity."user" AS account WHERE account.user_id=p_user_id)';
/** The sign-up writers' rule: the account's row was written by this very transaction, the sign-up's own, a moment before. */
const OWN_TRANSACTION = "pg_catalog.pg_current_xact_id()::xid";
/**
 * F5: the account functions keyed by a user id the request logins call, each with the step that last wrote it, the owner its question names and its
 * patches, in step order. The session's own (its list's revocations, the age check and its confirmation, the consent and its record, the email
 * settings and the change's resend, the publication's event refs and its key provision's abandonment, the data export's status and download)
 * ask 0171's question of the account they are handed: a reader answers as for nothing stored, a writer does and writes nothing, and each answers
 * as it does for an account with nothing to act on, before it updates, inserts or audits anything of the account's. The three sign-up writers
 * (the age check's record at sign-up, the region, the Italy approval), which a request makes with no session yet, write only for an account its own
 * transaction created (the row's xmin is the transaction's own).
 */
const ACCOUNTS = [
  { signature: "identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb)", step: "0040_account_erasure.sql", owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_audit_token IS NOT NULL THEN\n", new: "  IF v_audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", count: 1 }] },
  { signature: "identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb)", step: "0040_account_erasure.sql", owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_audit_token IS NOT NULL THEN\n", new: "  IF v_audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", count: 1 }] },
  { signature: "identity.read_age_check_outcome(uuid)", step: "0077_age_gate.sql", owner: USER_OWNER, kind: "reads", patches: [
    { old: "WHERE age.user_id=p_user_id)", new: `WHERE age.user_id=p_user_id\n    AND identity.request_owner_matches(${USER_OWNER}))`, count: 1 }] },
  { signature: "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)", step: "0077_age_gate.sql",
    owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_account.audit_token IS NOT NULL THEN\n", new: "  IF v_account.audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", count: 1 }] },
  { signature: "identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)", step: "0077_age_gate.sql", owner: null, kind: "creates", patches: [
    { old: "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n",
      new: `    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n      AND identity_user.xmin=${OWN_TRANSACTION}\n`, count: 1 }] },
  { signature: "identity.read_sensitive_data_consent(uuid)", step: "0078_sensitive_data_consent.sql", owner: USER_OWNER, kind: "reads", patches: [
    { old: "FROM identity.sensitive_data_consent AS consent WHERE consent.user_id=p_user_id)",
      new: `FROM identity.sensitive_data_consent AS consent WHERE consent.user_id=p_user_id\n    AND identity.request_owner_matches(${USER_OWNER}))`, count: 1 }] },
  { signature: "identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)", step: "0078_sensitive_data_consent.sql", owner: "identity_user.owner_ref", kind: "acts", patches: [
    { old: "      AND identity_user.state='active'\n", new: "      AND identity_user.state='active' AND identity.request_owner_matches(identity_user.owner_ref)\n", count: 1 }] },
  { signature: "identity.read_email_settings(uuid,uuid)", step: "0079_email_change.sql", owner: "account.owner_ref", kind: "reads", patches: [
    { old: "  WHERE account.user_id=p_user_id AND account.state='active'\n",
      new: "  WHERE account.user_id=p_user_id AND account.state='active' AND identity.request_owner_matches(account.owner_ref)\n", count: 1 }] },
  { signature: "identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb)", step: "0079_email_change.sql", owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_account.audit_token IS NOT NULL THEN\n", new: "  IF v_account.audit_token IS NOT NULL AND identity.request_owner_matches(v_account.owner_ref) THEN\n", count: 1 }] },
  { signature: "identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)", step: "0085_staff_access_foundation.sql", owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_account.audit_token IS NULL THEN RETURN; END IF;\n",
      new: "  IF v_account.audit_token IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN; END IF;\n", count: 1 }] },
  { signature: "serve.abandon_publication_key_provision(uuid,uuid)", step: "0085_staff_access_foundation.sql", owner: "v_account.owner_ref", kind: "acts", patches: [
    { old: "  IF v_account.owner_ref IS NULL THEN RETURN false; END IF;\n",
      new: "  IF v_account.owner_ref IS NULL OR NOT identity.request_owner_matches(v_account.owner_ref) THEN RETURN false; END IF;\n", count: 1 }] },
  { signature: "identity.record_registration_region(uuid,text,text)", step: "0095_registration_region.sql", owner: null, kind: "creates", patches: [
    { old: "    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n",
      new: `    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'\n      AND identity_user.xmin=${OWN_TRANSACTION}\n`, count: 1 }] },
  { signature: "identity.read_data_export_status(uuid)", step: "0115_data_export.sql", owner: USER_OWNER, kind: "reads", patches: [
    { old: "    WHERE e.user_id=p_user_id AND ((e.status IN", new: `    WHERE e.user_id=p_user_id AND identity.request_owner_matches(${USER_OWNER})\n      AND ((e.status IN`, count: 1 }] },
  { signature: "identity.record_data_export_download(uuid,uuid,jsonb)", step: "0115_data_export.sql", owner: "u.owner_ref", kind: "acts", patches: [
    { old: " AND e.status='SENT' AND e.expires_at>clock_timestamp();\n", new: " AND e.status='SENT' AND e.expires_at>clock_timestamp()\n      AND identity.request_owner_matches(u.owner_ref);\n", count: 1 }] },
  { signature: "identity.record_signup_italy_approval(uuid,jsonb)", step: "0125_italy_specific_approval.sql", owner: null, kind: "creates", patches: [
    { old: "  WHERE identity_user.user_id = p_user_id AND identity_user.state IN ('pending_verification','pending_mfa');\n",
      new: `  WHERE identity_user.user_id = p_user_id AND identity_user.state IN ('pending_verification','pending_mfa')\n    AND identity_user.xmin = ${OWN_TRANSACTION};\n`, count: 1 }] }
] as const;
/** The account bodies a chain step's postcondition digests: 0115's export status and download, and 0125's Italy approval; the others are older than the chain. */
const ACCOUNTS_PINNED = ["identity.read_data_export_status(uuid)", "identity.record_data_export_download(uuid,uuid,jsonb)", "identity.record_signup_italy_approval(uuid,jsonb)"] as const;
/** F5: 0040's lock asks of an owner it is handed, beside its own check; the legacy asker's branch (no owner) is as it was. */
const LOCK_ANCHOR = "    AND core.run_is_owned_by(run.run_id,p_owner_ref,p_legacy_asker_id)\n";
const LOCK_ASKS = "    AND (p_owner_ref IS NULL OR identity.request_owner_matches(p_owner_ref))\n";
/**
 * F5: 0147's public copy, refused right after its liveness check, before the ALREADY lookup and the INSERT: a dig's copy only under the connection's
 * own dig, keyed by the dig's own run; a report's copy only for a report still open on this publication and carrier, written by the connection's owner.
 */
const MATERIAL_ANCHOR = "  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;\n";
const MATERIAL_REFUSAL = [
  "  IF NOT (CASE p_kind WHEN 'DIG' THEN p_material_id = p_run_id AND identity.request_owner_matches(v_owner)\n",
  "      WHEN 'REPORT' THEN EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.report_id = p_material_id AND report.carrier_run_id = p_run_id\n",
  "        AND report.publication_ref = p_publication_ref AND report.outcome IS NULL AND identity.request_owner_matches(report.writer_ref))\n",
  "      ELSE false END) THEN\n",
  "    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH';\n",
  "  END IF;\n"].join("");
/**
 * F5: 0147's reader of a public debate's whole line, the runner's (every row, private ones too, whether or not a row's key still lives), which the API's
 * request login also calls for a digger's own rewrite: its one SELECT keeps only the rows of the connection's own runs, by each row's run's owner, so a
 * request with no session, or another's, reads no row; a login that holds the marker still reads every row, a run whose key is gone included.
 */
const LINE_ANCHOR = "    FROM jsonb_array_elements(identity.path_line_json(p_run_id, true)) WITH ORDINALITY AS entry(value, ordinality));";
const LINE_FILTER = "    FROM jsonb_array_elements(identity.path_line_json(p_run_id, true)) WITH ORDINALITY AS entry(value, ordinality)\n"
  + "    WHERE identity.request_owner_matches(identity.web_evidence_run_owner((entry.value->>'run_id')::uuid)));";
/**
 * F5: 0151's settlement refuses nothing (the judge's call was paid) and is the marker's alone (MOVED): it closes a flag NOT_FOUND or hides on AGREE
 * only for the reporter's own connection, or a marker login that presents no session, which the API's system login never does; and an AGREE hides
 * nothing for a flag staff dismissed while the judge ran (the row it read under its lock), which goes to a person instead.
 */
const FLAG_PATCHES = [
  { old: "  v_state := CASE p_verdict WHEN 'NOT_FOUND' THEN 'NOT_FOUND' ELSE 'QUEUED' END;",
    new: "  v_state := CASE WHEN p_verdict = 'NOT_FOUND' AND identity.request_owner_matches(v.reporter_ref) THEN 'NOT_FOUND' ELSE 'QUEUED' END;", count: 1 },
  { old: "  IF p_verdict = 'AGREE' AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL",
    new: "  IF p_verdict = 'AGREE' AND v.dismissed_at IS NULL AND identity.request_owner_matches(v.reporter_ref) AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL", count: 1 }
] as const;
/**
 * F5: 0151's opening, after its refusal: it counts against the lower of the limits it is handed and the site's own (identity.public_flag_site_limits,
 * read once, before the person's lock; null while no release is CURRENT, so LEAST keeps the caller's), so a request may tighten the API's numbers and
 * never loosen them. Every comparison of a count is with the variable; none with an argument, and no number of the limits stands in the SQL.
 */
const FLAG_OPEN_PATCHES = [
  { old: "DECLARE v_held boolean; v_check boolean;\n",
    new: "DECLARE v_held boolean; v_check boolean; v_limits jsonb; v_person_hour integer; v_debate_day integer; v_site_day integer;\n", count: 1 },
  { old: "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-flag-person:' || p_owner_ref::text, 0));\n",
    new: "  v_limits := identity.public_flag_site_limits();\n"
      + "  v_person_hour := LEAST(p_person_hour, (v_limits->>'person_hour')::integer);\n"
      + "  v_debate_day := LEAST(p_debate_day, (v_limits->>'debate_day')::integer);\n"
      + "  v_site_day := LEAST(p_site_day, (v_limits->>'site_day')::integer);\n"
      + "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-flag-person:' || p_owner_ref::text, 0));\n", count: 1 },
  { old: ") >= p_person_hour THEN RETURN 'LIMITED'; END IF;", new: ") >= v_person_hour THEN RETURN 'LIMITED'; END IF;", count: 1 },
  { old: ") < p_debate_day\n", new: ") < v_debate_day\n", count: 2 },
  { old: ") < p_site_day;", new: ") < v_site_day;", count: 1 }
] as const;
/**
 * F5: left out on purpose, a funded member's grant totals: billing functions whose grants 0130's verifier pins, which 0140's admission and staff's
 * allowance page read for other members as their owner; a request must name a member's owner, grant and configured event, and while a funded
 * debate's funding basis names its grant and event to any request by run id, none may read the member's owner ref.
 */
const SPEND_READERS = ["read_internal_grant_spent", "read_internal_grant_commitments"] as const;
/**
 * F5: the refusals left alone on purpose, each a question whose true its callers act on as a refusal (they hide or refuse the subject it answers
 * true for), so an owner question in it would read a connection that is not the owner's as not refused: each with the step that last wrote it and
 * the header's name for it. None is patched, so none is an amendment or this step's own digest's.
 */
const REFUSALS_LEFT = [
  { signature: "serve.run_removed_by_synthesis_check(uuid)", step: "0126_synthesis_check.sql", header: "0126's run_removed_by_synthesis_check" },
  { signature: "billing.owner_erasure_pending(uuid)", step: "0089_billing_erasure_hook.sql", header: "billing.owner_erasure_pending" },
  { signature: "billing.owner_age_frozen(uuid)", step: "0089_billing_erasure_hook.sql", header: "owner_age_frozen: true refuses" },
  { signature: "billing.owner_erasure_committed(uuid)", step: "0091_billing_erasure_commit.sql", header: "owner_erasure_committed and owner_age_frozen" },
  { signature: "billing.read_run_funding_basis(uuid)", step: "0092_internal_funded_allowance.sql", header: "billing.read_run_funding_basis: its null" }
] as const;
/** F4a: the nine scopes, each once the setting debateai.<scope>_forget. */
const SCOPES = ["web_evidence", "investigation", "dig_model", "dig_picks", "public_debate", "tree_updates", "passage_retention", "path_suggestions", "public_tree"] as const;
/** F4a: the ten guards that read a setting, with the scope each now asks. */
const GUARDS = [
  { signature: "identity.guard_web_evidence_record()", scope: "web_evidence" },
  { signature: "identity.guard_investigation_record()", scope: "investigation" },
  { signature: "identity.guard_dig_model_record()", scope: "dig_model" },
  { signature: "identity.guard_dig_pick_record()", scope: "dig_picks" },
  { signature: "identity.guard_investigation_report_record()", scope: "investigation" },
  { signature: "identity.guard_public_debate_record()", scope: "public_debate" },
  { signature: "identity.guard_tree_update_record()", scope: "tree_updates" },
  { signature: "identity.guard_passage_retention_record()", scope: "passage_retention" },
  { signature: "identity.guard_path_suggestions_record()", scope: "path_suggestions" },
  { signature: "identity.guard_public_tree_record()", scope: "public_tree" }
] as const;
/** F4a: the eleven definers that set a setting, with the scopes each now opens and closes. */
const SETTERS = [
  { signature: "identity.forget_erased_debate_web_evidence(uuid)", scopes: ["web_evidence"] },
  { signature: "identity.forget_erased_debate_investigation(uuid)", scopes: ["investigation"] },
  { signature: "identity.forget_erased_debate_dig_model(uuid)", scopes: ["dig_model"] },
  { signature: "identity.forget_erased_debate_dig_picks(uuid)", scopes: ["dig_picks"] },
  { signature: "identity.forget_erased_debate_public(uuid)", scopes: ["public_debate"] },
  { signature: "identity.forget_erased_debate_tree_updates(uuid)", scopes: ["tree_updates"] },
  { signature: "identity.wipe_debate_passages(uuid,text)", scopes: ["web_evidence", "passage_retention"] },
  { signature: "identity.forget_erased_debate_passages(uuid)", scopes: ["passage_retention"] },
  { signature: "identity.forget_erased_debate_path_suggestions(uuid)", scopes: ["path_suggestions"] },
  { signature: "identity.forget_erased_debate_public_tree(uuid)", scopes: ["public_tree"] },
  { signature: "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)", scopes: ["public_tree"] }
] as const;
/**
 * F2: 0123's run writer, the one statement every owner's run is created by (RunRepository's #insertRun: a new ask's run, direct or the room's START
 * and WAIT, and a re-admission's), marks a dig as it creates it. The run's document may carry `digRun`, JSON true only: any other value refuses the
 * document, as its closed key list refuses any other key, and writes nothing. A run so marked, or one that re-admits a dig (its intent names the run
 * it re-admits), gets its own row right after its ownership event, in the same statement, so nothing after the creation can leave a dig unmarked.
 */
const MARKING = { signature: "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)", patches: [
  { old: "'contentAttestationSecret','releaseKey'\n  ]::text[]", new: "'contentAttestationSecret','releaseKey','digRun'\n  ]::text[]", count: 1 },
  { old: "    OR jsonb_array_length(p_battery_rows)>100 THEN\n",
    new: "    OR jsonb_array_length(p_battery_rows)>100\n    OR (p_run ? 'digRun' AND p_run->'digRun' IS DISTINCT FROM 'true'::jsonb) THEN\n", count: 1 },
  { old: "  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);\n",
    new: "  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);\n"
      + "  IF p_run->'digRun' = 'true'::jsonb OR identity.run_is_dig((SELECT marked.readmitted_from_run_id FROM core.run_key_provision_intent AS marked\n"
      + "      WHERE marked.run_id = v_run_id)) THEN\n"
      + "    INSERT INTO identity.dig_run (run_id, owner_ref) VALUES (v_run_id, p_owner_ref) ON CONFLICT (run_id) DO NOTHING;\n"
      + "  END IF;\n", count: 1 }
] } as const;
/** F2: the earlier bodies that refuse a dig, each with its one anchor and what follows it. */
const REFUSING = [
  { signature: "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)",
    old: "OR NOT core.run_private_content_is_live(p_run_id) THEN\n    RETURN false;\n  END IF;\n",
    new: "OR NOT core.run_private_content_is_live(p_run_id) THEN\n    RETURN false;\n  END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN false; END IF;\n" },
  // The owner's ask for the team's approval to publish a flagged debate: never for a dig, before the grant is consumed or a request is queued.
  { signature: "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)",
    old: "  IF v_requests>=2 THEN RETURN 'NOT_ALLOWED'; END IF;\n",
    new: "  IF v_requests>=2 THEN RETURN 'NOT_ALLOWED'; END IF;\n  IF identity.run_is_dig(p_run_id) THEN RETURN 'NOT_ALLOWED'; END IF;\n" },
  { signature: "identity.read_free_debates_to_publish(integer)",
    old: "AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref",
    new: "AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref AND NOT identity.run_is_dig(ask.run_id)" },
  // The Free path's own claim, the first question of both its prepare and its publish, the one other way a snapshot is written.
  { signature: "identity.claim_free_public_ask(uuid)",
    old: "IF NOT FOUND OR v_ask.outcome IS NOT NULL OR",
    new: "IF NOT FOUND OR v_ask.outcome IS NOT NULL OR identity.run_is_dig(p_run_id) OR" },
  // The Free notice of a debate that is to go public when finished: a dig's is no one's, so none waits for ever.
  { signature: "identity.record_free_public_ask(uuid,uuid)",
    old: "IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN 'NOT_OWNED'; END IF;",
    new: "IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) OR identity.run_is_dig(p_run_id) THEN RETURN 'NOT_OWNED'; END IF;" }
] as const;
/**
 * F2: 0131's per-debate forget also takes the erased debate's own dig row, by the debate's own run and never by its parent, so a parent's deletion
 * leaves its digs their rows; it counts what it took, as it counts its visits and links.
 */
const FORGETTING = { signature: "identity.forget_erased_debate_page_memory(uuid)", patches: [
  { old: "  v_links integer;\nBEGIN\n", new: "  v_links integer;\n  v_marks integer;\nBEGIN\n", count: 1 },
  { old: "  RETURN v_visits + v_links;\n",
    new: "  DELETE FROM identity.dig_run AS mark WHERE mark.run_id = p_run_id;\n  GET DIAGNOSTICS v_marks = ROW_COUNT;\n  RETURN v_visits + v_links + v_marks;\n", count: 1 }
] } as const;
/** The functions that write a publication's snapshot: 0085's transition (under the key provision's intent) and 0137's Free publish (under its claim). */
const SNAPSHOT_WRITERS = ["core.transition_run_publication", "core.publish_free_debate"] as const;
/**
 * The chain's loaders that digest no function at all, so the pin scan below finds no pins in them: each reads tables, constraints or a trigger's
 * function name in its postcondition, never pg_proc. Every other loader hands pg_proc a value the scan must resolve.
 */
const NO_FUNCTION_PINS = ["0113_billing_price_currencies.sql", "0114_role_rotation.sql", "0122_engine_map_check.sql", "0129_support_answer_scope.sql", "0154_region_iceland_liechtenstein.sql", "0164_main_answer_path_added.sql"] as const;
/**
 * The steps applied before the chain, each by its own module. The chain records no amendment of either (it refuses one, AMENDMENT_ORDER), so this step
 * may change none of the functions their digests pin; 0110's module says a change to one of its shared functions re-plans 110.
 */
const PRE_CHAIN = ["0108_preview_recovery_verified_bindings.sql", "0110_account_erasure_public_debates.sql"] as const;
/**
 * How many signatures the scan reads from each loader whose digest is not handed one plain FUNCTIONS list, so it cannot read fewer again unseen:
 * 0108's and 0110's manifests (0110's shared bindings, which its loader binds to its SHARED list, included), 0111's list as its query's second value,
 * 0112's frozen list of another name, and 0116's list with its three spread lists (seven writers, three readers, two social functions and five of its own).
 */
const IRREGULAR_PINS = { "0108_preview_recovery_verified_bindings.sql": 5, "0110_account_erasure_public_debates.sql": 10, "0111_billing_netopia.sql": 3,
  "0112_auth_db_batch.sql": 30, "0116_mail_locale.sql": 17 } as const;
/**
 * The loaders that read pg_proc outside their digest, with how often they name pg_proc or pg_get_functiondef there: 0116's replay verifier asks its
 * writers and its sealed functions by name and one function's grant, and 0108's check of the migrating role asks six billing functions' owner. Neither
 * is a postcondition the chain re-measures, so no amendment covers either.
 */
const UNDIGESTED_READS = { "0108_preview_recovery_verified_bindings.sql": 1, "0116_mail_locale.sql": 5 } as const;
/**
 * The earlier bodies it patches in place, through the inventory, in its order: F4b's, then F4a's in step order, each step's guard before its definers, then
 * F5's in step order (the request-facing definers, then the billing functions keyed by a run or an owner, then the account functions keyed by a user
 * id), then F2's (the mark at creation, its refusals, then the forget).
 */
const PATCHED = [
  { fix: "F4b", signature: "staff.read_public_review(jsonb,text,uuid)" },
  ...[
    "identity.guard_web_evidence_record()", "identity.forget_erased_debate_web_evidence(uuid)",
    "identity.guard_investigation_record()", "identity.forget_erased_debate_investigation(uuid)",
    "identity.guard_dig_model_record()", "identity.forget_erased_debate_dig_model(uuid)",
    "identity.guard_dig_pick_record()", "identity.forget_erased_debate_dig_picks(uuid)",
    "identity.guard_investigation_report_record()",
    "identity.guard_public_debate_record()", "identity.forget_erased_debate_public(uuid)",
    "identity.guard_tree_update_record()", "identity.forget_erased_debate_tree_updates(uuid)",
    "identity.guard_passage_retention_record()", "identity.wipe_debate_passages(uuid,text)", "identity.forget_erased_debate_passages(uuid)",
    "identity.guard_path_suggestions_record()", "identity.forget_erased_debate_path_suggestions(uuid)",
    "identity.guard_public_tree_record()", "identity.forget_erased_debate_public_tree(uuid)",
    "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)"
  ].map((signature) => ({ fix: "F4a", signature })),
  ...REQUEST_FACING.map(({ signature }) => ({ fix: "F5", signature })),
  ...BILLING.map(({ signature }) => ({ fix: "F5", signature })),
  ...ACCOUNTS.map(({ signature }) => ({ fix: "F5", signature })),
  { fix: "F2", signature: MARKING.signature },
  ...REFUSING.map(({ signature }) => ({ fix: "F2", signature })),
  { fix: "F2", signature: FORGETTING.signature }
] as const;
const AMENDS = [
  { step: "0112_auth_db_batch.sql", field: "function_definition", functions: ["identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)", "identity.prove_consumer_recovery(jsonb,jsonb)", "staff.claim_alert_delivery(integer)"] },
  { step: "0115_data_export.sql", field: "function_definition", functions: ["identity.read_data_export_status(uuid)", "identity.record_data_export_download(uuid,uuid,jsonb)"] },
  { step: "0116_mail_locale.sql", field: "function_definition", functions: ["identity.read_consumer_security_notice(uuid,uuid)"] },
  { step: "0118_language_check_spend.sql", field: "function_definition", functions: ["ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)"] },
  { step: "0120_reply_measures.sql", field: "function_definition", functions: ["core.read_terminal_recorded_facts(uuid)"] },
  { step: "0123_side_by_side_releases.sql", field: "function_definition", functions: ["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)", "core.list_unstarted_readmissions(uuid)"] },
  { step: "0125_italy_specific_approval.sql", field: "function_definition", functions: ["identity.record_signup_italy_approval(uuid,jsonb)"] },
  { step: "0126_synthesis_check.sql", field: "function_definition", functions: ["serve.purge_expired_synthesis_check_removal_notices()", "serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)", "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)", "serve.synthesis_check_removal_notice_exists(uuid)", "serve.take_synthesis_check_removal_notice(uuid)"] },
  { step: "0127_publication_review.sql", field: "function_definition", functions: ["serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)", "serve.publication_review_approved(uuid,uuid,integer)", "serve.read_publication_review_state(uuid,uuid,uuid)"] },
  { step: "0128_threat_reports.sql", field: "function_definition", functions: ["ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)", "staff.claim_threat_report_alerts(integer)", "staff.complete_threat_report_alert(uuid,uuid,boolean)", "staff.erase_due_threat_reports()", "staff.keep_threat_report(text,uuid)", "staff.keep_threat_report_with_email(text,uuid,text)", "staff.threat_report_recipient_user(uuid)"] },
  { step: "0131_v4_account_memory.sql", field: "function_definition", functions: ["identity.forget_erased_debate_page_memory(uuid)", "identity.page_memory_run_owned(uuid,uuid)", "identity.read_page_reading_level(uuid)", "identity.save_page_reading_level(uuid,text)"] },
  { step: "0132_web_evidence.sql", field: "function_definition", functions: ["identity.forget_erased_debate_web_evidence(uuid)", "identity.guard_web_evidence_record()", "identity.read_web_evidence(uuid)", "identity.read_web_page_texts(uuid,uuid[])", "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)", "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)", "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)", "identity.record_web_picks(uuid,text,uuid[])", "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)", "identity.record_web_researched(uuid,uuid,uuid)", "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)", "identity.settle_web_researched(uuid,uuid,text)"] },
  { step: "0133_investigations.sql", field: "function_definition", functions: ["identity.close_investigation(uuid,uuid)", "identity.forget_erased_debate_investigation(uuid)", "identity.guard_investigation_record()", "identity.join_investigation(uuid,uuid,uuid,text[],text)", "identity.read_investigation(uuid,uuid)", "identity.read_investigation_of_run(uuid)", "identity.read_reserve(uuid)", "identity.record_investigation_report(uuid,integer,uuid)", "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)", "identity.wipe_inactive_web_page_text(integer)"] },
  { step: "0134_dig_model_and_month_pause.sql", field: "function_definition", functions: ["identity.forget_erased_debate_dig_model(uuid)", "identity.guard_dig_model_record()", "identity.read_dig_level_of_run(uuid)", "identity.read_investigation_dig_levels(uuid,uuid)", "identity.read_path_rewrite_turn(uuid)", "identity.read_path_rewrites(uuid,uuid)", "identity.read_path_rewrites_of_run(uuid)", "identity.read_paused_runs(uuid)", "identity.read_run_pause(uuid,uuid)", "identity.read_run_pause_of_run(uuid)", "identity.read_web_plan(uuid)", "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)", "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)", "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)", "identity.resume_paused_run(uuid,uuid)", "identity.take_path_rewrite_turn(uuid,uuid,text)"] },
  { step: "0135_dig_picks.sql", field: "function_definition", functions: ["identity.forget_erased_debate_dig_picks(uuid)", "identity.guard_dig_pick_record()", "identity.read_dig_picks_of_run(uuid)", "identity.read_unwritten_path_rewrites(timestamptz,integer)", "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)", "identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)"] },
  { step: "0136_investigation_reports.sql", field: "function_definition", functions: ["identity.guard_investigation_report_record()", "identity.read_closing_since_of_root(uuid)", "identity.read_investigation_reports_of_run(uuid)", "identity.read_investigation_waiting_of_run(uuid)", "identity.read_unreported_closings(integer)", "identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)"] },
  { step: "0137_public_debates.sql", field: "function_definition", functions: ["core.prepare_free_publication(uuid,uuid)", "core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)", "identity.claim_free_public_ask(uuid)", "identity.forget_erased_debate_public(uuid)", "identity.guard_public_debate_record()", "identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)", "identity.read_free_debates_to_publish(integer)", "identity.read_own_public_contributions(uuid,uuid)", "identity.read_public_contribution_of_run(uuid)", "identity.read_public_report_spent(uuid,timestamptz,timestamptz)", "identity.record_free_public_ask(uuid,uuid)", "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)", "identity.record_public_dig_picks(uuid,uuid,jsonb)", "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)", "identity.refuse_free_publication(uuid)", "identity.settle_public_contribution(uuid,text,uuid)"] },
  { step: "0138_tree_updates.sql", field: "function_definition", functions: ["identity.close_public_investigation(uuid,uuid)", "identity.forget_erased_debate_tree_updates(uuid)", "identity.guard_tree_update_record()", "identity.read_main_answer_updates(uuid,uuid)", "identity.read_main_answer_updates_of_run(uuid)", "identity.read_path_climb_next(uuid)", "identity.read_path_line(uuid,uuid)", "identity.read_path_line_of_run(uuid)", "identity.read_path_update_turn(uuid)", "identity.read_run_purpose_lines(uuid,uuid)", "identity.read_run_purpose_lines_of_run(uuid)", "identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)", "identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)", "identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)", "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)", "identity.reopen_public_investigation(uuid,integer)", "identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)"] },
  { step: "0139_passage_retention.sql", field: "function_definition", functions: ["identity.forget_erased_debate_passages(uuid)", "identity.guard_passage_retention_record()", "identity.read_debates_holding_passages(integer)", "identity.read_web_reply_texts(uuid,uuid[])", "identity.read_web_shown_quotes(uuid)", "identity.record_web_reply_text(uuid,uuid,jsonb,bytea)", "identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)", "identity.wipe_debate_passages(uuid,text)"] },
  { step: "0141_path_suggestions.sql", field: "function_definition", functions: ["identity.forget_erased_debate_path_suggestions(uuid)", "identity.guard_path_suggestions_record()", "identity.read_path_suggestions_of_run(uuid)", "identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)"] },
  { step: "0140_internal_spend_kinds.sql", field: "function_definition", functions: ["billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)", "staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  { step: "0142_team_limit.sql", field: "function_definition", functions: ["staff.authorize_action(jsonb,text)", "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)", "staff.claim_team_limit_notices(integer)", "staff.complete_team_limit_notice(uuid,uuid,boolean)", "staff.team_limit_notice_user(uuid,uuid)"] },
  { step: "0143_run_handover.sql", field: "function_definition", functions: ["identity.continue_paused_run_in_release(uuid,uuid,text,bigint)", "identity.run_work_is_parked(uuid,text,timestamptz)", "identity.wipe_inactive_web_page_text_of_idle_debates(integer)"] },
  { step: "0144_ask_clarify_charge.sql", field: "function_definition", functions: ["identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)", "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)", "staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  { step: "0145_web_researched_unsettled.sql", field: "function_definition", functions: ["identity.read_unsettled_web_researched(integer)"] },
  { step: "0146_team_allowances.sql", field: "function_definition", functions: ["staff.allowance_notice_user(uuid,uuid)", "staff.claim_allowance_notices(integer)", "staff.complete_allowance_notice(uuid,uuid,boolean)"] },
  { step: "0147_public_tree.sql", field: "function_definition", functions: ["identity.forget_erased_debate_public_tree(uuid)", "identity.guard_public_tree_record()", "identity.mark_public_climb_done(uuid)", "identity.open_public_report(uuid,uuid,uuid,boolean)", "identity.read_free_debate_owner(uuid)", "identity.read_public_answer_updates(uuid)", "identity.read_public_checks_passed(integer)", "identity.read_public_climb_next(uuid)", "identity.read_public_climbs_owed(integer)", "identity.read_public_dig_input(uuid)", "identity.read_public_digs_unsettled(timestamptz,integer)", "identity.read_public_material(uuid)", "identity.read_public_page_owed(integer)", "identity.read_public_path_line(uuid)", "identity.read_public_report_charged_until(uuid)", "identity.read_public_reports_owed(integer)", "identity.read_public_reports_unwritten(integer)", "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)", "identity.record_public_check_passed(uuid,uuid)", "identity.record_public_debate_report(uuid,integer,uuid,jsonb)", "identity.record_public_dig_input(uuid,text,jsonb,bytea)", "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)", "identity.record_public_page_skip(uuid,uuid,text,text)", "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)", "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)", "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)"] },
  { step: "0149_public_report_team_month.sql", field: "function_definition", functions: ["identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)", "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)", "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)", "identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)"] },
  { step: "0150_public_review.sql", field: "function_definition", functions: ["staff.claim_public_review_notices(integer)", "staff.complete_public_review_notice(uuid,uuid,boolean)", "staff.public_review_notice_user(uuid,uuid)", "staff.read_public_review(jsonb,text,uuid)"] },
  { step: "0151_public_flag.sql", field: "function_definition", functions: ["identity.delete_public_flag_words_due()", "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)", "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)", "identity.read_public_review_purge_due(integer)", "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)", "staff.claim_public_flag_notices(integer)", "staff.complete_public_flag_notice(uuid,uuid,boolean)", "staff.public_flag_notice_user(uuid,uuid)"] },
  { step: "0153_dig_tree_settled.sql", field: "function_definition", functions: ["identity.dig_is_settled(uuid)", "identity.mark_dig_tree_settled(uuid)"] },
  { step: "0158_pre_start_charge.sql", field: "function_definition", functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  { step: "0163_carry_on_session_free_digs.sql", field: "function_definition", functions: ["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)"] },
  { step: "0165_pre_start_release.sql", field: "function_definition", functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  { step: "0168_set_aside_continue.sql", field: "function_definition", functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] }
] as const;

type Patch = Readonly<{ old: string; new: string; count: number }>;
type InventoryItem = Readonly<{ fix: string; signature: string; patches: readonly Patch[] }>;
const inventory = (sql: string): readonly InventoryItem[] => {
  const found = /\$inventory\$(\[[\s\S]*?\])\$inventory\$/u.exec(sql);
  expect(found, "the patch inventory").not.toBeNull();
  return JSON.parse(found![1]!) as InventoryItem[];
};
/** A function's text from its CREATE to the `$$;` that closes its body. */
const bodyOf = (sql: string, name: string): string => {
  const at = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("$$;", at));
};
const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;
const earlierSteps = (): string[] => readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();
/** The step whose file last defines `name` in so many words, before this one. */
const lastDefinerOf = (name: string): string | undefined => earlierSteps().filter((step) => definedFunctionNames(read(`migrations/${step}`)).includes(name)).at(-1);
/**
 * Every loader's step and the functions its postcondition digests, read where the loader hands them to pg_proc: each query that joins
 * `unnest($n::text[]) signature` to pg_proc digests the definition and the grants of the n-th value it is passed. That value is one of the loader's const
 * lists, each `...NAME` in it resolved against the loader's other const lists (0116's FUNCTIONS spreads three), or a local that names one, or (0108, 0110)
 * what the loader's manifest names, 0110's shared bindings among them. A value, spread or item the scan cannot resolve fails it, as does any read of
 * pg_proc outside such a query but those UNDIGESTED_READS names, and a loader with no such query must be one NO_FUNCTION_PINS names.
 */
const pinnedBy = (): ReadonlyMap<string, readonly string[]> => {
  const pins = new Map<string, readonly string[]>();
  const mentions = (text: string): number => (text.match(/\bpg_proc\b|\bpg_get_functiondef\b/gu) ?? []).length;
  for (const file of readdirSync(new URL("packages/db/src/", ROOT)).filter((entry) => /^migration-forward.*\.ts$/u.test(entry)
      && !["migration-forward0171.ts", "migration-forward-chain.ts"].includes(entry))) {
    const loader = read(`packages/db/src/${file}`);
    const step = /const NAME\s*=\s*["']([^"']+)["']/u.exec(loader)?.[1];
    expect(step, file).toBeDefined();
    const manifestPath = /const MANIFEST_PATH\s*=\s*["']([^"']+)["']/u.exec(loader)?.[1];
    // The loader's const lists by name, their comments dropped; a list holds signatures and spreads of other lists, nothing else.
    // A list may also name a single signature by its const (0165's and 0168's SPENT).
    const signatures = new Map([...loader.matchAll(/const ([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"\s*;/gu)].map((match) => [match[1]!, match[2]!] as const));
    const lists = new Map([...loader.matchAll(/const ([A-Z][A-Z0-9_]*)\b[^=]*=\s*(?:Object\.freeze\()?\[([\s\S]*?)\]\s*(?:as const\s*)?\)?\s*(?:as const\s*)?;/gu)]
      .map((match) => [match[1]!, match[2]!.replace(/\/\/[^\n]*/gu, "")] as const));
    const listed = (name: string, seen: readonly string[]): string[] => {
      const list = lists.get(name);
      expect(list !== undefined && !seen.includes(name), `${file}: ${[...seen, name].join(" > ")} does not resolve`).toBe(true);
      expect(list!.replace(/\.\.\.[A-Z][A-Z0-9_]*|"[^"]*"|'[^']*'|\b[A-Z][A-Z0-9_]*\b/gu, "").replace(/[\s,]/gu, ""), `${file}: ${name} holds what the scan cannot read`).toBe("");
      return [...list!.matchAll(/\.\.\.([A-Z][A-Z0-9_]*)|"([^"]*)"|'([^']*)'|\b([A-Z][A-Z0-9_]*)\b/gu)].flatMap(([, spread, double, single, constant]) => {
        if (spread !== undefined) return listed(spread, [...seen, name]);
        const signature = double ?? single ?? signatures.get(constant!);
        expect(signature, `${file}: ${name}`).toMatch(/^[a-z_]+\.[a-z_0-9]+\([^()]*\)$/u);
        return [plain(signature!)];
      });
    };
    const valueOf = (value: string): string[] => {
      if (/^[A-Z][A-Z0-9_]*$/u.test(value)) return listed(value, []);
      const local = /^[a-z]\w*$/u.test(value) ? new RegExp(`const ${value}\\s*=\\s*([^;]+);`, "u").exec(loader)?.[1] : undefined;
      if (local !== undefined) return valueOf(local.trim());
      // 0108 and 0110 hand their digest the manifest's functions and shared bindings, which each loader checks one for one against its own lists.
      const fields = [...value.matchAll(/\bforward\.(\w+)/gu)].map((match) => match[1]!);
      expect(fields.length > 0 && manifestPath !== undefined, `${file}: its digest is handed ${value}, which the scan cannot read`).toBe(true);
      const manifest = JSON.parse(read(`migrations/${manifestPath!}`)) as Record<string, unknown>;
      return fields.flatMap((field) => {
        const entries = [manifest[field]].flat() as Array<{ signature?: unknown } | undefined>;
        expect(entries.every((entry) => typeof entry?.signature === "string"), `${file}: the manifest's ${field}`).toBe(true);
        return entries.map((entry) => plain(entry!.signature as string));
      });
    };
    const digests = [...loader.matchAll(/`([^`]*)`\s*,\s*\[([^\]]*)\]\s*\)/gu)].flatMap(([, query, values]) => {
      const at = /\bunnest\(\$(\d+)::text\[\]\) signature JOIN pg_proc p ON p\.oid=to_regprocedure\(signature\)/u.exec(query!);
      return at === null ? [] : [{ query: query!, value: values!.split(",")[Number(at[1]) - 1]?.trim() ?? "" }];
    });
    for (const { query } of digests) {
      expect(query, file).toContain("pg_get_functiondef(p.oid)");
      expect(query, file).toMatch(/\bp\.proacl\b/u);
    }
    expect(mentions(loader) - digests.reduce((sum, { query }) => sum + mentions(query), 0), `${file} reads pg_proc outside a digest the scan reads`)
      .toBe((UNDIGESTED_READS as Readonly<Record<string, number>>)[step!] ?? 0);
    expect(digests.length === 0, `${file}: digests no function exactly when NO_FUNCTION_PINS names it`).toBe((NO_FUNCTION_PINS as readonly string[]).includes(step!));
    pins.set(step!, digests.flatMap(({ value }) => valueOf(value)));
  }
  return pins;
};

describe("0171: the security review's fixes in the database", () => {
  it("follows 0170 last in the chain, with its own loader, and keeps 0130's verifier", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0171 } from './migration-forward0171.js';");
    expect(chain).toContain("loadForward0169,loadForward0170,loadForward0171]");
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "security-review-hardening-forward0171-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/security-review-hardening-forward0171.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0171_");
    expect(loader).toContain("export async function loadForward0171(");
    for (const { signature } of ADDED) expect(loader, signature).toContain(`"${signature}"`);
    for (const { relation } of TABLES) expect(loader, relation).toContain(`"${relation}"`);
    // An earlier function it changes that no earlier step's postcondition digests is digested by its own: 0040's lock of a request's own runs (F5),
    // the billing bodies that ask now but 0140's admission (F5: 0089's, 0092's and 0107's, older than the chain, and the two 0123 restated, which
    // 0123's digest leaves out), the account bodies older than the chain (F5: 0040's to 0095's) and 0085's key provision (F2's refusal).
    const pins = pinnedBy();
    const unpinned = [...new Set(inventory(read(SQL_PATH)).map(({ signature }) => plain(signature)))].filter((signature) => ![...pins.values()].some((functions) => functions.includes(signature)));
    expect(unpinned).toEqual(["core.lock_owned_live_runs(uuid[],uuid,text)",
      ...BILLING.map(({ signature }) => signature).filter((signature) => !(BILLING_PINNED as readonly string[]).includes(signature)),
      ...ACCOUNTS.map(({ signature }) => signature).filter((signature) => !(ACCOUNTS_PINNED as readonly string[]).includes(signature)),
      "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)"]);
    for (const signature of BILLING_PINNED) expect([...pins.entries()].filter(([, functions]) => functions.includes(signature)).map(([step]) => step), signature).toEqual(["0140_internal_spend_kinds.sql"]);
    for (const signature of ACCOUNTS_PINNED) {
      expect([...pins.entries()].filter(([, functions]) => functions.includes(signature)).map(([step]) => step), signature)
        .toEqual([ACCOUNTS.find((account) => account.signature === signature)!.step]);
    }
    for (const signature of unpinned) expect(loader, signature).toContain(`"${signature}"`);
    // So is each earlier function whose grant alone it moves or takes back and that no earlier step's postcondition digests: 0040's evaluator call
    // check and the functions of 0046 to 0100 older than the chain, 0085's verification delivery and 0098's and 0100's sign-in and recovery readers among them.
    const own = new Set(ADDED.map(({ signature }) => plain(signature)));
    const regranted = [...new Set([...read(SQL_PATH).matchAll(/^(?:GRANT|REVOKE) EXECUTE ON FUNCTION (\S+) (?:TO|FROM) \w+;$/gmu)].map((match) => plain(match[1]!)))]
      .filter((signature) => !own.has(signature) && ![...pins.values()].some((functions) => functions.includes(signature)));
    expect(regranted).toContain("evaluator.provider_call_request_is_authorized(uuid,text,text,text)");
    for (const signature of ["identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)", "identity.read_consumer_passkey_credential(text,text,text)",
      "identity.complete_consumer_passkey_login(jsonb,jsonb)", "identity.read_consumer_recovery_proof(text,integer)"]) expect(regranted, signature).toContain(signature);
    for (const signature of regranted) expect([`"${signature}"`, `'${signature}'`].some((quoted) => loader.includes(quoted)), signature).toBe(true);
    const plan = await loadMigrationPlan();
    const step = plan.forwardChain.at(-1)!;
    expect(step.name).toBe(NAME);
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
  });

  it("is bound to 0170's manifest and its own bytes, and the manifest and the plan declare the same amendments", async () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "security-review-hardening-forward0171-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    // The loader refuses a manifest whose list differs from its own, and the plan hands the chain the list.
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-1)!.amendsPostconditionsOf).toEqual(AMENDS);
  });

  it("declares `-- n1: drained` and `-- n1: keeps-verifier`: it creates no billing relation or function and moves no billing grant, owner, definer flag or setting", () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect([...definedFunctionNames(sql), ...definedRelationNames(sql)].filter((name) => name.startsWith("billing."))).toEqual([]);
    // 0130's verifier pins the billing relations' and functions' grants, owners, definer flags and settings, and no billing body. Nothing here grants,
    // revokes, alters, writes or triggers on any billing object, so it stays in force as it is; the bodies it changes, it changes in place (the patch
    // block refuses any move of a function's authority).
    expect(code(sql)).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|ALTER\s+(?:TABLE|FUNCTION|VIEW|SEQUENCE)|ON|TO)\s+(?:ONLY\s+)?billing\./iu);
    expect(code(sql)).not.toMatch(/\b(?:GRANT|REVOKE)\b[^;]*\bbilling\./iu);
    // Only the patch inventory and the contract name a billing object: the inventory the seven billing bodies it changes and what they read (the
    // run's charge scope, and billing.internal_grant, which 0144's charge writer asks, as that table's own owner, whether the grant it is handed is its
    // person's own and was running), and the contract the same, with the writer's owner's right to read the grant.
    expect(code(sql.slice(0, sql.indexOf("$inventory$[")) + sql.slice(sql.indexOf("]$inventory$"), sql.indexOf("DO $security_review_contract$")))).not.toContain("billing.");
    const named = (text: string): string[] => [...new Set([...code(text).matchAll(/\bbilling\.\w+/gu)].map(([name]) => name))].sort();
    const items = inventory(sql);
    expect(items.filter(({ signature }) => signature.startsWith("billing.")).map(({ signature }) => signature)).toEqual(BILLING.map(({ signature }) => signature));
    expect(named(items.flatMap(({ patches }) => patches.map((patch) => patch.new.split(patch.old).join(""))).join("\n")))
      .toEqual(["billing.internal_grant", "billing.run_charge_scope"]);
    expect(named(sql.slice(sql.indexOf("$inventory$["), sql.indexOf("]$inventory$"))))
      .toEqual([...BILLING.map(({ signature }) => nameOf(signature)), "billing.internal_grant", "billing.run_charge_scope"].sort());
  });

  it("restates no earlier function: it defines only what it adds, and changes an earlier body only through the patch inventory, each anchor where the inventory says", () => {
    const sql = read(SQL_PATH);
    expect([...definedFunctionNames(sql)].sort()).toEqual(ADDED.map(({ signature }) => nameOf(signature)).sort());
    // A new name each, but the delivery's overload, whose name 0085 last defined; its own argument list is new (the catalog has one function of each).
    for (const added of ADDED) expect(lastDefinerOf(nameOf(added.signature)), added.signature).toBe(overloadOf(added));
    const overload = bodyOf(sql, "identity.record_verification_delivery_with_audit");
    expect(overload).toContain("CREATE OR REPLACE FUNCTION identity.record_verification_delivery_with_audit(p_user_id uuid, p_token_hash text, p_occurred_at timestamptz,");
    expect(bodyOf(read("migrations/0085_staff_access_foundation.sql"), "identity.record_verification_delivery_with_audit")).not.toContain("p_token_hash");
    expect(code(sql)).not.toMatch(/\bDROP\s+FUNCTION\b/u);
    const items = inventory(sql);
    expect(items.map(({ fix, signature }) => ({ fix, signature }))).toEqual(PATCHED);
    for (const item of items) {
      // The anchor stands in the function's last definition as often as the inventory says; the database counts it again, live, as the step applies.
      const definer = lastDefinerOf(nameOf(item.signature));
      expect(definer, item.signature).toBeDefined();
      const body = bodyOf(read(`migrations/${definer!}`), nameOf(item.signature));
      for (const patch of item.patches) {
        // A plain SQL reader made plpgsql (the "raises" kind) is anchored on its frame as pg_get_functiondef prints it: the language line and the
        // body's opening and close, once each in any definition. The source spells that frame its own way, so it is checked here for what it is.
        const frame = ({ " LANGUAGE sql\n": /\bLANGUAGE sql\b/gu, "AS $function$\n": /\bAS \$\$\n/gu, "\n$function$\n": /\n$/gu } as Readonly<Record<string, RegExp>>)[patch.old];
        if (frame !== undefined) {
          expect(body.match(frame)?.length ?? 0, `${item.signature}: ${patch.old}`).toBe(patch.count);
          continue;
        }
        expect(occurrences(body, patch.old), `${item.signature}: ${patch.old}`).toBe(patch.count);
        expect(body, item.signature).not.toContain(patch.new);
      }
    }
    // The patch block counts each anchor, refuses a replacement already there, and refuses any move of the function's authority.
    const block = sql.slice(sql.indexOf("DO $security_review_patch$"), sql.indexOf("$security_review_patch$;"));
    expect(block).toContain("v_found <> (v_patch->>'count')::integer OR pg_catalog.strpos(v_definition, v_patch->>'new') > 0");
    expect(block).toContain("SELECT p.proowner, p.proacl, p.prosecdef, p.proconfig, p.provolatile INTO v_before");
    expect(block).toContain("v_before IS DISTINCT FROM v_after");
  });

  it("every earlier function it changes, a grant taken back included, is declared against every chain step whose postcondition digests it, and only those; no pre-chain step's is changed", async () => {
    const sql = read(SQL_PATH);
    const own = new Set(ADDED.map(({ signature }) => plain(signature)));
    const changed = new Set([
      ...inventory(sql).map(({ signature }) => plain(signature)),
      ...[...sql.matchAll(/^(?:GRANT|REVOKE) EXECUTE ON FUNCTION (\S+) (?:TO|FROM) \w+;$/gmu)].map((match) => plain(match[1]!))
    ].filter((signature) => !own.has(signature)));
    expect([...changed].sort()).toEqual([...new Set([...PATCHED, ...REVOKED].map(({ signature }) => plain(signature)))].sort());
    const pins = pinnedBy();
    // The scan read as many signatures as each irregular loader's digest is handed, and it read every step the chain applies before this one.
    expect(Object.fromEntries(Object.keys(IRREGULAR_PINS).map((step) => [step, pins.get(step)?.length]))).toEqual(IRREGULAR_PINS);
    const chain = new Set((await loadMigrationPlan()).forwardChain.map(({ name }) => name));
    expect([...chain].filter((step) => step !== NAME && !pins.has(step))).toEqual([]);
    expect([...pins.keys()].filter((step) => !chain.has(step)).sort()).toEqual([...PRE_CHAIN]);
    // A pre-chain step's pins cannot be amended, so none is changed; nothing this step adds is any earlier step's pin.
    for (const step of PRE_CHAIN) expect([...changed].filter((signature) => pins.get(step)!.includes(signature)), step).toEqual([]);
    for (const signature of own) expect([...pins.entries()].filter(([, functions]) => functions.includes(signature)).map(([step]) => step), signature).toEqual([]);
    const expected = [...pins.entries()].filter(([step]) => chain.has(step))
      .flatMap(([step, functions]) => [...changed].filter((signature) => functions.includes(signature)).map((signature) => `${step} ${signature}`)).sort();
    const declared = AMENDS.flatMap(({ step, functions }) => functions.map((signature) => `${step} ${plain(signature)}`)).sort();
    expect(declared).toEqual(expected);
    // Each amendment names a chain step applied before this one; the loaders that digest no function were read and pin nothing.
    for (const { step } of AMENDS) expect(step < NAME && chain.has(step), step).toBe(true);
    for (const step of NO_FUNCTION_PINS) expect(pins.get(step), step).toEqual([]);
  });

  it("passes the replay audit, and the N-1 audit finds nothing a drained step may not do", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const step of earlierSteps()) {
      const source = read(`migrations/${step}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("every new function is a pinned definer that starts revoked from PUBLIC and the six roles, owned as its schema's objects are, with exactly its one grant or none", () => {
    const sql = code(read(SQL_PATH));
    for (const { signature } of ADDED) {
      expect(bodyOf(sql, nameOf(signature)), signature).toMatch(/SECURITY DEFINER SET search_path=pg_catalog AS \$\$/u);
      expect(sql, signature).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,${ROLES.join(",")}`);
      expect(sql, signature).toContain(`ALTER FUNCTION ${signature} OWNER TO %I`);
    }
    // core's objects take core's owner; identity's take 0115's export owner, but the clarify charge's reservations and their writer, which take 0144's
    // charge writer's (debateai_staff_security_owner), so the writer that consumes them needs no grant.
    expect(sql).toContain("'core.run_is_published(uuid,uuid)'::regprocedure");
    expect(sql).toContain("'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure");
    expect(sql).toContain("'identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)'::regprocedure");
    expect(sql).toContain("ALTER TABLE identity.ask_clarify_reservation OWNER TO %I', v_writer");
    expect(sql).toContain("ALTER FUNCTION identity.reserve_ask_clarify_charge(uuid,uuid) OWNER TO %I', v_writer");
    expect(sql).toContain("ALTER FUNCTION identity.delete_ask_clarify_reservations_due(integer) OWNER TO %I', v_writer");
    // The helper's one grant serves every staff-owned definer that asks: 0144's spend total, the clarify reservation and the five billing definers
    // of 0092, 0107, 0123 and 0140 (section 5 checks that each owner may ask), so the comments over the helper's owner and its grant name them all.
    const raw = read(SQL_PATH);
    for (const statement of ["EXECUTE pg_catalog.format('ALTER FUNCTION identity.request_owner_matches(uuid) OWNER TO %I', v_owner);",
      "GRANT EXECUTE ON FUNCTION identity.request_owner_matches(uuid) TO debateai_staff_security_owner;"]) {
      const at = raw.indexOf(statement);
      const comment = raw.slice(raw.lastIndexOf("-- F5:", at), at).replace(/\n\s*-- */gu, " ");
      for (const needle of ["0144's spend total", "the clarify reservation", "0092's grant of a run", "0123's run state and person's grant", "0107's settlement",
        "0140's admission"]) expect(comment, `${statement}: ${needle}`).toContain(needle);
    }
    // And F5's day tables: their INSERT to the marker, after every function's grant; no other table right is granted.
    expect([...sql.matchAll(/^GRANT (.+) TO (\w+);$/gmu)].map((match) => [match[1], match[2]]))
      .toEqual([...GRANTED.map(({ signature, grantee }) => [`EXECUTE ON FUNCTION ${signature}`, grantee]),
        ...DAY_TABLES.map((relation) => [`INSERT ON ${relation}`, "debateai_rls_all_accounts"])]);
    expect(sql).not.toMatch(/GRANT (?:SELECT|UPDATE|DELETE)/u);
    // Each new table: replayable, guarded against TRUNCATE, owned as the functions that use it are, and no role's.
    expect([...definedRelationNames(sql)].sort()).toEqual(TABLES.map(({ relation }) => relation).sort());
    for (const { relation } of TABLES) {
      expect(sql, relation).toContain(`CREATE TABLE IF NOT EXISTS ${relation} (`);
      expect(sql, relation).toContain(`SELECT core.install_truncate_guard('${relation}');`);
      expect(sql, relation).toContain(`ALTER TABLE ${relation} OWNER TO %I`);
      expect(sql, relation).toContain(`REVOKE ALL ON ${relation} FROM PUBLIC,${ROLES.join(",")}`);
    }
  });

  it("F3: the legacy public join's one grant is taken back, no code calls it, and its function stays for 0137's receipt", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^REVOKE (.+) FROM (\w+);$/gmu)].map((match) => [match[1], match[2]]))
      .toEqual([...REVOKED.map(({ signature, role }) => [`EXECUTE ON FUNCTION ${signature}`, role]), ...TABLE_REVOKED.map((revoke) => [revoke, "debateai_runtime"])]);
    // 0137 granted it to the API's billing role alone.
    expect([...read("migrations/0137_public_debates.sql").matchAll(/^GRANT EXECUTE ON FUNCTION identity\.join_public_investigation\([^)]*\) TO (\w+);$/gmu)].map((match) => match[1]))
      .toEqual(["debateai_billing_runtime"]);
    expect(read("packages/db/src/migration-forward0137.ts")).toContain('"identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)"');
    const repository = read("packages/db/src/public-debates.ts");
    expect(repository).not.toContain("join_public_investigation");
    expect(repository).not.toContain("PublicJoinOutcome");
    expect(repository).not.toMatch(/^\s+async join\(/mu);
  });

  it("F4a: the ten guards ask a scope and the eleven definers open and close it where they set the setting; nothing earlier reads or sets one any more", () => {
    const raw = read(SQL_PATH);
    const sql = code(raw);
    const items = inventory(raw).filter(({ fix }) => fix === "F4a");
    expect(items.map(({ signature }) => signature).sort()).toEqual([...GUARDS, ...SETTERS].map(({ signature }) => signature).sort());
    expect(new Set([...GUARDS.map(({ scope }) => scope), ...SETTERS.flatMap(({ scopes }) => scopes)])).toEqual(new Set(SCOPES));
    // Each guard: its one reading of the setting becomes the question to the same scope.
    for (const { signature, scope } of GUARDS) {
      expect(items.find((item) => item.signature === signature)!.patches, signature).toEqual([
        { old: `pg_catalog.current_setting('debateai.${scope}_forget', true) = 'on'`, new: `identity.forget_scope_open('${scope}')`, count: 1 }]);
    }
    // Each definer: the setting on and off become the opening and the closing of the same scope; in its last definition, every DELETE stands between the two.
    for (const { signature, scopes } of SETTERS) {
      expect(items.find((item) => item.signature === signature)!.patches, signature).toEqual([
        ...scopes.map((scope) => ({ old: `PERFORM pg_catalog.set_config('debateai.${scope}_forget', 'on', true);`, new: `PERFORM identity.open_forget_scope('${scope}');`, count: 1 })),
        ...scopes.map((scope) => ({ old: `PERFORM pg_catalog.set_config('debateai.${scope}_forget', 'off', true);`, new: `PERFORM identity.close_forget_scope('${scope}');`, count: 1 }))]);
      const body = bodyOf(read(`migrations/${lastDefinerOf(nameOf(signature))!}`), nameOf(signature));
      for (const scope of scopes) {
        const on = body.indexOf(`set_config('debateai.${scope}_forget', 'on', true)`);
        const off = body.indexOf(`set_config('debateai.${scope}_forget', 'off', true)`);
        expect(on, `${signature} ${scope}`).toBeGreaterThan(-1);
        expect([...body.matchAll(/\bDELETE FROM identity\.(\w+)/gu)].filter((match) => (match.index ?? -1) > on && (match.index ?? -1) < off).length, `${signature} ${scope}`).toBeGreaterThan(0);
      }
    }
    // Nothing else: every mention of a debateai.*_forget setting in the code (not the comments) of every earlier step stands in a function patched here, in that
    // function's last definition, as many times as the inventory patches it.
    const mentions = new Map<string, number>();
    const mentionedIn = new Map<string, string>();
    for (const step of earlierSteps()) {
      const source = code(read(`migrations/${step}`));
      for (const mention of source.matchAll(/debateai\.[a-z_]+_forget/gu)) {
        const creates = [...source.slice(0, mention.index ?? 0).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_]+\.[a-z_0-9]+)\(/gu)];
        const name = creates.at(-1)?.[1] ?? `${step}: outside any function`;
        mentions.set(name, (mentions.get(name) ?? 0) + 1);
        mentionedIn.set(name, step);
      }
    }
    for (const [name, step] of mentionedIn) expect(lastDefinerOf(name), name).toBe(step);
    expect(Object.fromEntries([...mentions.entries()].sort())).toEqual(Object.fromEntries(items.map(({ signature, patches }) => [nameOf(signature), patches.length]).sort()));
    // 0080's legal and 0084's billing retention guards are not this step's (0130's verifier pins the billing purge settings): no legal or billing name here
    // but F5's move of 0080's purge's grant (its revoke, its grant and the contract's two checks), which leaves its body and 0080's guard as they were.
    expect(items.filter(({ signature }) => /^(?:legal|billing)\./u.test(signature))).toEqual([]);
    expect(occurrences(sql, "legal.purge_expired_acceptance(timestamptz)")).toBe(4);
    expect(sql.replaceAll("legal.purge_expired_acceptance(timestamptz)", "")).not.toMatch(/\blegal\.|retention_purge/u);
    // The scope table: one row a transaction and scope, the nine scopes and no other.
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity.private_forget_scope ("), sql.indexOf(");", sql.indexOf("CREATE TABLE IF NOT EXISTS identity.private_forget_scope (")));
    expect(table).toContain("transaction_id xid8 NOT NULL");
    expect(table).toContain("CONSTRAINT private_forget_scope_pkey PRIMARY KEY (transaction_id, scope)");
    expect([.../scope IN \(([^)]*)\)/u.exec(table)![1]!.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1])).toEqual([...SCOPES]);
    // The helpers key the scope by the top-level transaction's id; the guards' question assigns none.
    expect(bodyOf(sql, "identity.open_forget_scope")).toContain("LANGUAGE sql VOLATILE SECURITY DEFINER");
    expect(bodyOf(sql, "identity.open_forget_scope")).toContain("VALUES (pg_catalog.pg_current_xact_id(), p_scope) ON CONFLICT DO NOTHING");
    expect(bodyOf(sql, "identity.close_forget_scope")).toContain("LANGUAGE sql VOLATILE SECURITY DEFINER");
    expect(bodyOf(sql, "identity.close_forget_scope")).toContain("WHERE open_scope.transaction_id = pg_catalog.pg_current_xact_id() AND open_scope.scope = p_scope");
    expect(bodyOf(sql, "identity.forget_scope_open")).toContain("LANGUAGE sql STABLE SECURITY DEFINER");
    expect(bodyOf(sql, "identity.forget_scope_open")).toContain("WHERE open_scope.transaction_id = pg_catalog.pg_current_xact_id_if_assigned() AND open_scope.scope = p_scope");
    // The contract checks each guard and each definer by name and scope, the table, and the whole catalog for a setting still read.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const { signature, scope } of GUARDS) expect(contract, signature).toContain(`('${signature}', '${scope}', 'guard')`);
    for (const { signature, scopes } of SETTERS) for (const scope of scopes) expect(contract, signature).toContain(`('${signature}', '${scope}', 'definer')`);
    for (const refusal of ["F4a scope table", "F4a reachable %", "F4a guard % %", "F4a definer % %", "F4a setting still read"]) {
      expect(contract, refusal).toContain(`'SECURITY_REVIEW_0171_CONTRACT ${refusal}'`);
    }
  });

  it("F4b: the reviewer's door asks whether the link is current before it marks anything read; the helper reads the latest visibility event, never the hold", () => {
    const sql = code(read(SQL_PATH));
    const item = inventory(read(SQL_PATH)).find(({ fix, signature }) => fix === "F4b" && signature === "staff.read_public_review(jsonb,text,uuid)");
    expect(item!.patches).toEqual([{
      old: "IF core.public_review_snapshot(p_publication_ref) IS NULL THEN RETURN NULL; END IF;",
      new: "IF core.public_review_snapshot(p_publication_ref) IS NULL OR NOT core.publication_is_current(p_publication_ref) THEN RETURN NULL; END IF;",
      count: 1
    }]);
    const door = bodyOf(read("migrations/0150_public_review.sql"), "staff.read_public_review");
    expect(door.indexOf(item!.patches[0]!.old)).toBeLessThan(door.indexOf("identity.public_review_mark_read("));
    expect(door.indexOf(item!.patches[0]!.old)).toBeGreaterThan(door.indexOf("staff.require_http_authority("));
    const helper = bodyOf(sql, "core.publication_is_current");
    expect(helper).toContain("latest.state = 'PUBLISHED' AND latest.publication_ref = p_publication_ref");
    expect(helper).toContain("WHERE event.run_id = core.run_of_publication(p_publication_ref) ORDER BY event.at_seq DESC LIMIT 1");
    expect(helper).not.toContain("public_review_held");
    // The material reader is left as it is: its other caller hands back the revision and the hold, never the material.
    const command = bodyOf(read("migrations/0150_public_review.sql"), "staff.read_public_review_command");
    expect(command).toContain("RETURN jsonb_build_object('expectedRevision',(v->>'revision')::bigint,'hidden',(v->>'hidden')::boolean);");
    expect(inventory(read(SQL_PATH)).map(({ signature }) => signature)).not.toContain("identity.public_review_material(uuid)");
  });

  it("F5: 0131's rule and each request-facing definer ask the session's owner, the workers' functions move to the marker, and what nothing calls is no role's", () => {
    const raw = read(SQL_PATH);
    const sql = code(raw);
    const items = inventory(raw).filter(({ fix }) => fix === "F5");
    expect(items.map(({ signature }) => signature)).toEqual([...REQUEST_FACING, ...BILLING, ...ACCOUNTS].map(({ signature }) => signature));
    const check = (owner: string) => `IF NOT identity.request_owner_matches(${owner}) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;`;
    for (const { signature, owner, kind } of ASKING) {
      const patches = items.find((item) => item.signature === signature)!.patches;
      const body = bodyOf(read(`migrations/${lastDefinerOf(nameOf(signature))!}`), nameOf(signature));
      // The owner (or the run) argument the check names is the function's own; the member, material and flag kinds name a row the body read.
      if (ARGUMENT_KINDS.includes(kind)) expect(body, signature).toMatch(new RegExp(`[(,]\\s*${owner} uuid(?:\\[\\])?[,)]`, "u"));
      if (kind === "run") {
        // The run-keyed readers the API's answer read calls on its request login: the liveness question they opened with becomes 0131's rule of
        // the run's own owner, still the body's first statement, so another account's debate, or any with no session, answers as for nothing stored.
        expect(patches, signature).toEqual([{ old: `IF identity.web_evidence_run_owner(${owner}) IS NULL THEN RETURN NULL; END IF;`,
          new: `IF NOT identity.page_memory_run_owned(identity.web_evidence_run_owner(${owner}), ${owner}) THEN RETURN NULL; END IF;`, count: 1 }]);
        expect(body, signature).toContain("LANGUAGE plpgsql");
        expect(body, signature).toContain(`\nBEGIN\n  ${patches[0]!.old}\n`);
      } else if (kind === "exported") {
        expect(patches, signature).toEqual([{ old: `IF identity.web_evidence_run_owner(${owner}) IS NULL THEN RETURN NULL; END IF;`, new: EXPORTED_GUARD, count: 1 }]);
        expect(body, signature).toContain(`\nBEGIN\n  ${patches[0]!.old}\n`);
        // Its one caller in SQL is 0132's export reader, granted to the export worker alone, which names only its leased account's debates.
        const caller = bodyOf(read("migrations/0132_web_evidence.sql"), "identity.read_data_export_web_evidence");
        expect(caller).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
        expect(caller).toContain("WHERE search.owner_ref = v_owner_ref");
        expect(read("migrations/0132_web_evidence.sql")).toContain("GRANT EXECUTE ON FUNCTION identity.read_data_export_web_evidence(uuid,uuid) TO debateai_data_export_worker;");
      } else if (kind === "run_owner" || kind === "attempt") {
        // The engine's older run-keyed questions and 0126's result writer: one line that asks the run's latest owner, after the one the function
        // already asks of the run; once in the body, so 0123's legacy asker's branch, which names no owner, is as it was, and a mismatch answers as
        // for nothing stored (no row listed, false), or, for the writer, refuses as no attempt does, before anything is written.
        const run = owner.slice(owner.indexOf("event.run_id = ") + "event.run_id = ".length, owner.indexOf(" ORDER BY"));
        expect(body, signature).toMatch(new RegExp(`[(,]\\s*${run} uuid[,)]`, "u"));
        expect(patches.length, signature).toBe(1);
        expect(occurrences(body, patches[0]!.old), signature).toBe(1);
        const patched = body.split(patches[0]!.old).join(patches[0]!.new);
        expect(occurrences(patched, "identity.request_owner_matches("), signature).toBe(1);
        const asks = (indent: string): string => `${indent}AND identity.request_owner_matches(${owner})\n`;
        const { old } = patches[0]!;
        expect(patches[0]!.new, signature).toBe(({
          "core.list_unstarted_readmissions(uuid)": `${old}${asks("    ")}`,
          "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)":
            old.replace("\n  ) THEN\n", `\n${asks("      ")}  ) THEN\n`),
          "serve.publication_review_approved(uuid,uuid,integer)": `${old}${asks("      ")}`
        } as Readonly<Record<string, string>>)[signature]);
        if (signature === "core.list_unstarted_readmissions(uuid)") {
          expect(patched.indexOf("identity.request_owner_matches("), signature).toBeLessThan(patched.indexOf("\n  UNION\n"));
        }
        if (kind === "attempt") {
          expect(patched.indexOf("identity.request_owner_matches("), signature).toBeGreaterThan(patched.indexOf("FROM serve.synthesis_check_attempt AS attempt"));
          expect(patched.indexOf("identity.request_owner_matches("), signature).toBeLessThan(patched.indexOf("SYNTHESIS_CHECK_ATTEMPT_MISMATCH"));
          expect(patched.indexOf("SYNTHESIS_CHECK_ATTEMPT_MISMATCH"), signature).toBeLessThan(patched.indexOf("INSERT INTO"));
        }
      } else if (kind === "locks") {
        // 0040's lock of a request's own runs: an owner's runs only for that owner's connection; the legacy asker's branch (no owner) as it was.
        expect(patches, signature).toEqual([{ old: LOCK_ANCHOR, new: `${LOCK_ANCHOR}${LOCK_ASKS}`, count: 1 }]);
        expect(body, signature).toContain("LANGUAGE plpgsql");
        expect(body, signature).toContain("OR (p_owner_ref IS NULL)=(p_legacy_asker_id IS NULL)");
      } else if (kind === "material") {
        // The public copy: refused after the liveness check and before the ALREADY lookup and the INSERT, so a copy is never written, nor an id
        // taken first, under another's dig or a report the connection's owner did not open.
        expect(patches, signature).toEqual([{ old: MATERIAL_ANCHOR, new: `${MATERIAL_ANCHOR}${MATERIAL_REFUSAL}`, count: 1 }]);
        expect(body.indexOf(MATERIAL_ANCHOR), signature).toBeGreaterThan(body.indexOf("v_owner := identity.web_evidence_run_owner(p_run_id);"));
        expect(body.indexOf(MATERIAL_ANCHOR), signature).toBeLessThan(body.indexOf("IF EXISTS (SELECT 1 FROM identity.public_material AS material"));
        expect(body.indexOf(MATERIAL_ANCHOR), signature).toBeLessThan(body.indexOf("INSERT INTO identity.public_material"));
      } else if (kind === "line") {
        // The public line: its publication question first, as it was; then the one SELECT, which now keeps the connection's own runs' rows alone.
        expect(patches, signature).toEqual([{ old: LINE_ANCHOR, new: LINE_FILTER, count: 1 }]);
        expect(body, signature).toContain("LANGUAGE plpgsql");
        expect(body.indexOf("IF core.current_publication_of_run(p_run_id) IS NULL"), signature).toBeGreaterThan(-1);
        expect(body.indexOf(LINE_ANCHOR), signature).toBeGreaterThan(body.indexOf("IF core.current_publication_of_run(p_run_id) IS NULL"));
        expect(body.indexOf(LINE_ANCHOR), signature).toBeGreaterThan(body.indexOf("RETURN (SELECT COALESCE(jsonb_agg("));
        expect(occurrences(body, "RETURN (SELECT"), signature).toBe(1);
      } else if (kind === "flag") {
        // The settlement: the judge's call was paid, so it records the verdict and the usage whoever settles, and it is the marker's alone (MOVED);
        // only the reporter's own connection, or a marker login presenting no session, closes the flag NOT_FOUND or hides the debate, and never for a
        // flag staff dismissed: the row it reads again under its lock, after the debate's own, is the one it asks.
        expect(patches, signature).toEqual(FLAG_PATCHES);
        expect(body, signature).not.toContain("REQUEST_OWNER_MISMATCH");
        expect(body, signature).toContain("UPDATE identity.public_flag SET state = v_state, verdict = p_verdict, reason = p_reason, judge_provider_ref = p_provider");
        expect(body.indexOf(FLAG_PATCHES[1].old), signature).toBeGreaterThan(body.indexOf("SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id FOR UPDATE;"));
        expect(MOVED, signature).toContain(signature);
      } else if (kind === "opens") {
        // The opening: its refusal first, as every other that refuses, then the site's own limits, read before the person's lock, each the lower of
        // the two; every count compared with the variable, none with an argument. 0151's file is untouched, so its own pins stand.
        expect(patches, signature).toEqual([{ old: "\nBEGIN\n", new: `\nBEGIN\n  ${check(owner)}\n`, count: 1 }, ...FLAG_OPEN_PATCHES]);
        expect(body.slice(0, body.indexOf("\nBEGIN\n")), signature).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|PERFORM)\b/u);
        const patched = patches.reduce((text, patch) => text.split(patch.old).join(patch.new), body);
        expect([...patched.matchAll(/\)\s*(>=|<)\s*(\S+?)(?:\s|;)/gu)].map((match) => match[2]), signature).toEqual(["v_person_hour", "v_debate_day", "v_debate_day", "v_site_day"]);
        expect(patched.indexOf("  v_limits := identity.public_flag_site_limits();\n"), signature).toBeLessThan(patched.indexOf("'identity:public-flag-person:'"));
        expect(patched.indexOf("  IF NOT identity.request_owner_matches(p_owner_ref)"), signature).toBeLessThan(patched.indexOf("  v_limits := "));
      } else if (kind === "refuses") {
        // The first statement of its body, before anything is read, locked or written.
        expect(patches, signature).toEqual([{ old: "\nBEGIN\n", new: `\nBEGIN\n  ${check(owner)}\n`, count: 1 }]);
        expect(body.indexOf("\nBEGIN\n"), signature).toBeGreaterThan(-1);
        expect(body.slice(0, body.indexOf("\nBEGIN\n")), signature).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|PERFORM)\b/u);
      } else if (kind === "raises") {
        // A plain SQL reader whose answer is read as a refusal or a cap (0127's review state: an open ask, an approval or two asks leave the owner
        // no ask; 0144's and 0149's totals: what a person spent): it becomes plpgsql to refuse as its first statement, then returns its one SELECT,
        // as it was, so a connection that is not the owner's is refused, never answered as for nothing stored.
        const table = body.includes("RETURNS TABLE");
        expect(patches, signature).toEqual([
          { old: " LANGUAGE sql\n", new: " LANGUAGE plpgsql\n", count: 1 },
          { old: "AS $function$\n", new: `AS $function$\nBEGIN\n  ${check(owner)}\n  ${table ? "RETURN QUERY\n" : "RETURN (\n"}`, count: 1 },
          { old: "\n$function$\n", new: `${table ? ";" : ");"}\nEND\n$function$\n`, count: 1 }
        ]);
        expect(body, signature).toMatch(/\bLANGUAGE sql\b/u);
        const source = body.slice(body.indexOf("AS $$\n") + "AS $$\n".length);
        expect(source.trimStart(), signature).toMatch(/^SELECT\b/u);
        expect(source, signature).not.toContain(";");
        expect(source, signature).not.toContain("request_owner_matches");
      } else {
        // 0131's rule and the plain SQL readers (the two of 0131 and 0150, 0126's removal notice and its question, 0133's
        // investigation of a run by its member's owner) add the question to what they already ask.
        expect(body, signature).toContain("LANGUAGE sql");
        expect(patches.length, signature).toBe(1);
        expect(patches[0]!.new, signature).toBe(`${patches[0]!.old} AND identity.request_owner_matches(${owner})`);
      }
    }
    // The helper: the session's account when one is presented, else any owner for a login that holds the marker and none for any other.
    const helper = bodyOf(sql, "identity.request_owner_matches");
    expect(helper).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect(helper).toContain("SELECT CASE WHEN context.owner_ref IS NOT NULL THEN COALESCE(context.owner_ref = p_owner_ref, false)");
    expect(helper).toContain("ELSE pg_catalog.pg_has_role(session_user, 'debateai_rls_all_accounts', 'MEMBER') END");
    expect(helper).toContain("FROM (SELECT rls.context_owner_ref() AS owner_ref) AS context");
    // The clarify charge's reservation: refuses a missing id or owner as the writer does, then an owner that is not the connection's, before it writes;
    // takes up to 100 reservations past the window, of every owner, oldest first, past any another call holds, so a row its charge never takes (a
    // refused, stopped or abandoned call) waits for no one's return, the owner's own included; reserves an id once, and refuses one another owner
    // holds (23505, which the API's breaker counts and does not latch on at once), while the same owner's repeat reserves nothing new. The table
    // holds ids and the time only, and goes with the account.
    const reserve = bodyOf(sql, "identity.reserve_ask_clarify_charge");
    expect(reserve).toContain("RETURNS text\nLANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    const refusesFirst = [
      "\nBEGIN\n  IF p_charge_id IS NULL OR p_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ASK_CLARIFY_CHARGE_INVALID'; END IF;\n",
      "  IF NOT identity.request_owner_matches(p_owner) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;\n"].join("");
    expect(reserve).toContain(refusesFirst);
    expect(reserve.indexOf(refusesFirst)).toBeLessThan(reserve.search(/\b(?:DELETE|INSERT)\b/u));
    const prune = [
      "  DELETE FROM identity.ask_clarify_reservation AS reservation WHERE reservation.charge_id IN (\n",
      "    SELECT stale.charge_id FROM identity.ask_clarify_reservation AS stale\n",
      `    WHERE stale.reserved_at <= pg_catalog.clock_timestamp() - ${CLARIFY_WINDOW}\n`,
      "    ORDER BY stale.reserved_at LIMIT 100 FOR UPDATE SKIP LOCKED);\n"].join("");
    const reserves = [
      "  INSERT INTO identity.ask_clarify_reservation (charge_id, owner_ref) VALUES (p_charge_id, p_owner) ON CONFLICT (charge_id) DO NOTHING;\n",
      "  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM identity.ask_clarify_reservation AS held WHERE held.charge_id = p_charge_id AND held.owner_ref = p_owner) THEN\n",
      "    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='ASK_CLARIFY_CHARGE_TAKEN';\n",
      "  END IF;\n",
      "  RETURN 'RESERVED';\nEND"].join("");
    expect(reserve).toContain(`${refusesFirst}${prune}${reserves}`);
    expect(reserve.match(/\bDELETE\b/gu)).toHaveLength(1);
    // The prune names no owner: a row waits for no one's return.
    expect(reserve.slice(0, reserve.indexOf("  INSERT INTO identity.ask_clarify_reservation"))).not.toMatch(/owner_ref\s*=\s*p_owner/u);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS ask_clarify_reservation_reserved_at ON identity.ask_clarify_reservation (reserved_at);");
    // The owner's index stays: the account's cascade finds its rows by it.
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS ask_clarify_reservation_owner ON identity.ask_clarify_reservation (owner_ref, reserved_at);");
    // The API's sweep, from a gated hourly timer and once each time its release becomes current, outside any request (the API's system login, which
    // holds the marker): the same rule as the prune, in batches the caller bounds, refused a limit outside 1 to 1000 before it deletes anything.
    const sweep = bodyOf(sql, "identity.delete_ask_clarify_reservations_due");
    expect(sweep).toContain("(p_limit integer) RETURNS integer\nLANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect(sweep).toContain([
      "\nDECLARE\n  v_rows integer;\nBEGIN\n",
      "  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ASK_CLARIFY_RESERVATION_SWEEP_INVALID'; END IF;\n",
      prune.replace("LIMIT 100", "LIMIT p_limit"),
      "  GET DIAGNOSTICS v_rows = ROW_COUNT;\n  RETURN v_rows;\nEND"].join(""));
    expect(sweep).not.toMatch(/owner_ref|p_owner/u);
    // One window: the writer's take, the prune and the sweep spell the same literal, the take's bound the exact complement of theirs.
    const windows = [PERSON_GUARD, reserve, sweep].flatMap((text) => [...text.matchAll(/interval '[^']*'/gu)].map(([literal]) => literal));
    expect(windows).toEqual([CLARIFY_WINDOW, CLARIFY_WINDOW, CLARIFY_WINDOW]);
    expect(PERSON_GUARD).toContain(`reservation.reserved_at > pg_catalog.clock_timestamp() - ${CLARIFY_WINDOW}`);
    expect(sweep).toContain(`stale.reserved_at <= pg_catalog.clock_timestamp() - ${CLARIFY_WINDOW}`);
    const reservations = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity.ask_clarify_reservation ("),
      sql.indexOf(");", sql.indexOf("CREATE TABLE IF NOT EXISTS identity.ask_clarify_reservation (")));
    expect(reservations.split("\n").slice(1).map((line) => line.trim()).filter((line) => line !== "")).toEqual(["charge_id uuid PRIMARY KEY,",
      'owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,', "reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()"]);
    // The writer's owner may ask the helper and owns the reservations it consumes; nothing earlier was the presented-session helper's.
    expect(raw).not.toContain("request_presents_session_of");
    // No rls function's grants move (that would amend 0130): the helper's owner reads the context as it is.
    expect(sql).not.toMatch(/\bON FUNCTION rls\./u);
    // A funded member's grant totals are left out on purpose: named so in the header, patched nowhere, their grants untouched.
    const header = raw.slice(0, raw.indexOf("-- 1. What this step adds"));
    for (const name of SPEND_READERS) {
      expect(header, name).toContain(name);
      expect(inventory(raw).filter(({ signature }) => signature.includes(`.${name}(`)), name).toEqual([]);
      expect(sql, name).not.toMatch(new RegExp(`ON FUNCTION \\S+\\.${name}\\(`, "u"));
    }
    // The header says what holds of the clarify charge now: the grant kept only when it is the person's own and was running, the hour's window and why
    // it is safe, the id another holds refused, the API's sweep, and the writer on the system login with the reservation naming the person; that the
    // site's day is the system's to write (the three runless ledger writers that took any caller and any amount, 0118's, 0128's and 0144's, through
    // their sites, the day's tables and the counter), and what stays open of it.
    const flat = header.replace(/\n-- */gu, " ");
    // And why the totals may stay open: a funded debate's basis, a refusal left alone, names its grant and configured event to any request by its run
    // id, so only the member's owner ref stands between a request and the totals, and the hardening test finds none a request may read. The round-5
    // wording, which said no request could read the grant and event either, is gone.
    for (const needle of ["can be read by its run id through 0092's funding basis", "only the member's owner ref, which 0130's row rule keeps from every request",
      "hands back an owner ref for the ids a request can read"]) expect(flat, needle).toContain(needle);
    expect(flat).not.toContain("and configured event to read one, which no request may read");
    for (const needle of ["billing.internal_grant", "configured event", "was running when the call was reserved", "an hour", "8-second deadline",
      "ASK_CLARIFY_CHARGE_TAKEN", "identity.delete_ask_clarify_reservations_due", "So the reservation is what names the person",
      "The site's day of spend is the system's to write", "0118's ledger.record_language_check_spend", "0128's ledger.record_question_check_spend",
      "any amount", "X30", "X31", "X32", "X33", "ledger.allocate_sequence()", "0130's rule holds it to the connection's own debates",
      "may write the day at any size", "spend waiver"]) expect(flat, needle).toContain(needle);
    for (const stale of ["Still open, a known exposure older than this step", "closing 0144's alone would leave the two doors beside it",
      "a member's own session can still charge"]) expect(flat, stale).not.toContain(stale);
    // And the flag's: the settlement believed the verdict it was handed, so it moves to the marker and the API's press calls it after the judge on its
    // system login (X38), so no request login records a verdict of its own choosing or hides a debate; the opening counts against the lower of the limits it is handed
    // and the site's own sealed row, and refuses on a CURRENT release with none; a flag staff dismissed hides nothing; and what stays open: a
    // deployment that never switched to a release keeps the caller's numbers, and a flag a request opens outside the press stays CHECKING. The staff
    // notice of an automatic hide is no request login's to claim (the loops moved below).
    for (const needle of ["believed the verdict of whoever called it", "no request login records a verdict", "X38", "after the judge",
      "identity.public_flag_site_limits", "the lower of the limits it is handed and the site's own", "PUBLIC_FLAG_LIMITS_UNRESOLVED", "never switched to a release",
      "staff dismissed", "stays CHECKING", "staff.claim_public_flag_notices"]) expect(flat, needle).toContain(needle);
    // And the engine's: its older run-keyed questions ask, what only the runner or the worker calls moves, and the two left alone on purpose are
    // named with why (one boolean each, which other accounts' debates' callers or the evaluator worker's ledger trigger ask on purpose).
    for (const needle of ["older than 0131 the API's requests call ask too", "legacy asker's branch", "0120's recorded facts", "0040's evaluator call check",
      "0126's inheritance writer", "run_private_content_is_live", "core.run_waiting_v", "ledger_entry_is_authenticated_scope", "with no marker and no session"]) {
      expect(flat, needle).toContain(needle);
    }
    // And the provider probe's: 0048's writer took any caller and any date, and the API's ask-time discovery takes a provider's latest row, by
    // probed_at, so a forged HEALTHY row dated now spared it a window's probe per row and one dated later made every ask probe until that date. The
    // writer moves to the marker, the API records through its site X37 and reads on the request login, and what stays open is said. The census no
    // longer leaves it alone, so the round-5 wording, which named it open there, is gone.
    for (const needle of ["0048's record of a provider's probe took any caller of debateai_runtime and any date", "0040's latest_provider_probes, by probed_at",
      "one freshness window per row written", "outrank every probe the API records", "X37", "reads the latest rows on the request login",
      "the runner records its claim-time probes on its own login", "a login that holds the marker may still date a probe as it likes",
      "0152's measure of what a public check used, a record of the site that holds no account's"]) {
      expect(flat, needle).toContain(needle);
    }
    for (const stale of ["a probe dated after now counts for nothing", "0048's provider probe and 0152's measure of what a public check used",
      "and 0048's provider probe, whose latest row", "may record a provider's probe dated as it likes", "so it waits for that review"]) {
      expect(flat, stale).not.toContain(stale);
    }
    // The round-4 wording, which said the forged AGREE stayed open, is gone with the hole.
    for (const stale of ["cannot tell the judge's AGREE from one its caller made up", "limits its caller passes"]) expect(flat, stale).not.toContain(stale);
    // The site's limits: the CURRENT release's own sealed row, by its key's number, of the three flag members, each a whole number from 1 to the
    // schema's bound (abuse-limits.ts), else 55000; null while no release is CURRENT. No limit value stands in it or in the opening's patches (0151's
    // rule: the made-up development values of abuse-limits.ts are not in the SQL), and no count is compared with a bare number.
    const limits = bodyOf(sql, "identity.public_flag_site_limits");
    expect(limits).toContain("RETURNS jsonb\nLANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    for (const needle of ["FROM core.read_current_release() AS current_release", "IF v_release IS NULL THEN RETURN NULL; END IF;",
      "pg_catalog.substring(v_release, '^r([1-9][0-9]*)-')::bigint", "r.row_key = 'abuseLimits' AND v.sealed", "v_row->>'kind' IS DISTINCT FROM 'ABUSE_LIMITS'",
      "ARRAY['flag_per_person_hour','flag_per_debate_day','flag_per_site_day']", "RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_FLAG_LIMITS_UNRESOLVED';"]) {
      expect(limits, needle).toContain(needle);
    }
    const madeUp = [...read("packages/register/src/abuse-limits.ts").matchAll(/\bflag_per_\w+: (\d+)/gu)].map((match) => Number(match[1]));
    expect(madeUp).toHaveLength(3);
    const opening = FLAG_OPEN_PATCHES.map((patch) => patch.new).join("\n");
    for (const value of madeUp) for (const text of [limits, opening]) expect(text, `limit value ${value}`).not.toMatch(new RegExp(`(?<![\\w'-])${value}(?![\\w'-])`, "u"));
    expect(`${limits}\n${opening}`).not.toMatch(/count\(\*\)[^;]*?\)\s*(?:>=|<=|>|<|=)\s*\d/u);
    // The press calls the settlement through its own port, after the judge, and the opening keeps the API's numbers as it passed them (0151's pin).
    const press = read("apps/api/src/public-flag.ts");
    expect(press).toContain("const settled = await ports.settlement.settle({ flagId: input.flagId, ...result });");
    expect(press).toContain('repository: Pick<PostgresPublicFlagRepository, "readTarget" | "open"> & Partial<Pick<PostgresPublicFlagRepository, "recordQuote">>;');
    expect(press).toContain('settlement: Pick<PostgresPublicFlagRepository, "settle">;');
    expect(press).not.toContain("ports.repository.settle");
    expect(press).toContain("limits: ports.limits }");
    // What moves: revoked from the runtime role and granted to the marker, one line each; what is taken back: from its one role alone.
    for (const signature of MOVED) {
      expect(sql, signature).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM ${movedFrom(signature)};\nGRANT EXECUTE ON FUNCTION ${signature} TO debateai_rls_all_accounts;`);
    }
    for (const { signature, role } of [...TAKEN, ...NARROWED]) expect(sql, signature).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM ${role};`);
    // The contract checks each of them by name, and the whole catalog for an owner still believed.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const { signature, owner, kind } of ASKING) expect(contract, signature).toContain(`('${signature}', '${owner.replace(/'/gu, "''")}', '${kind}')`);
    for (const { signature } of TAKEN) expect(contract, signature).toContain(`('${signature}', 'taken')`);
    for (const signature of MOVED) expect(contract, signature).toContain(`('${signature}', 'moved')`);
    // 0112's release stays the runtime's alone and gives back only the live claim it is handed; 0085's hold question keeps its other holders.
    expect(contract).toContain("WHERE p.oid = 'staff.release_alert_delivery(uuid,uuid)'::regprocedure AND a.grantee <> p.proowner;\n  IF v_grantees IS DISTINCT FROM ARRAY['debateai_runtime']");
    expect(contract).toContain("'s.claim_token IS DISTINCT FROM p_claim'");
    expect(contract).toContain("pg_catalog.has_function_privilege('debateai_runtime', 'identity.read_account_security_hold(uuid)', 'EXECUTE')");
    // 0048's probe writer moves, and 0040's reader of the latest probes stays the runtime's, as the API's discovery reads on its request login.
    expect(contract).toContain("IF NOT pg_catalog.has_function_privilege('debateai_runtime', 'core.latest_provider_probes(text[])', 'EXECUTE') THEN");
    for (const { signature } of NARROWED) {
      expect(contract, signature).not.toContain(`('F5', '${signature}')`);
      expect(contract, signature).not.toContain(`('${signature}', '`);
    }
    for (const refusal of ["F5 helper", "F5 reservation", "F5 reservation sweep", "F5 reservation reachable %", "F5 % grants % %", "F5 asks % %", "F5 owner believed",
      "F5 alert release %", "F5 account hold %", "F5 probe reader", "F5 day table %", "F5 day writers %", "F5 sequence %", "F5 work queue", "F5 clarify charge"]) {
      expect(contract, refusal).toContain(`'SECURITY_REVIEW_0171_CONTRACT ${refusal}'`);
    }
    // The contract pins the writer's question as the inventory writes it, asks that its owner may read the grants and still delete the reservations,
    // and pins the reservation's, the prune's and the sweep's text with the one window.
    for (const line of PERSON_GUARD.split("\n").filter((text) => text !== "")) expect(contract, line).toContain(line.replace(/'/gu, "''"));
    expect(contract).toContain("pg_catalog.has_table_privilege(v_proowner, 'billing.internal_grant', 'SELECT')");
    expect(contract).toContain("pg_catalog.strpos(v_definition, E'  v_admitted timestamptz;\\nBEGIN\\n') = 0");
    expect(contract).toContain("MESSAGE=''ASK_CLARIFY_CHARGE_TAKEN''");
    expect(contract).toContain(`stale.reserved_at <= pg_catalog.clock_timestamp() - ${CLARIFY_WINDOW.replace(/'/gu, "''")}\\n    ORDER BY stale.reserved_at LIMIT p_limit FOR UPDATE SKIP LOCKED);`);
    expect(contract).not.toContain("interval ''1 day''");
    // No code outside the tests calls what is taken back (the chain's loaders name them only to pin them), and packages/db offers none of their wrappers.
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist" || entry.name.startsWith(".")) continue;
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) walk(`${path}/`);
        else if (/\.(?:ts|tsx|mts|mjs|js|sql)$/u.test(entry.name) && !/^packages\/db\/src\/migration-forward\d*\.ts$/u.test(path)) sources.push(path);
      }
    };
    for (const dir of ["apps/", "packages/", "tools/", "deploy/"]) walk(dir);
    const overloaded = new Set(ADDED.filter((added) => overloadOf(added) !== undefined).map(({ signature }) => nameOf(signature)));
    for (const { signature } of TAKEN) {
      const callers = sources.filter((path) => read(path).includes(`${nameOf(signature)}(`));
      // A name the overload shares has its one caller, the identity repository's delivery record, which names the mail's token (six arguments).
      expect(callers, signature).toEqual(overloaded.has(nameOf(signature)) ? ["packages/db/src/identity.ts"] : []);
    }
    expect(read("packages/db/src/identity.ts")).toContain("SELECT identity.record_verification_delivery_with_audit(\n        $1,$2,$3,$4,$5,$6::jsonb\n      )");
  });

  it("F5: 0144's charge writer asks nothing of the connection: after the ledger row, the call's reservation names its person, or with none the owner it is handed", () => {
    // 0144's charge: the AI call it records was paid before it runs, so the site's ledger row is written whatever it is handed (0144's GONE rule),
    // and the person's row names the owner of the reservation of this very charge for this very owner, made before the call while the session was
    // live and taken as it is used, no older than the window, or with none the owner it is handed: the writer is the marker's alone, and an owner
    // question after the paid call could only leave the call out of its person's quota. Nothing about the session is asked of a reservation, so a
    // sign-out or a step-up's rotation while the call ran changes nothing. The grant it is handed funds the call only when it is the person's own, by
    // its configured event, and was running when the call was admitted (the reservation's time, or now); one that ended while the call ran still holds
    // it, as a run's admitted call settles on its grant. It refuses nothing.
    const raw = read(SQL_PATH);
    const sql = code(raw);
    const patches = inventory(raw).find((item) => item.signature === CHARGE.signature)!.patches;
    const body = bodyOf(read(`migrations/${lastDefinerOf(nameOf(CHARGE.signature))!}`), nameOf(CHARGE.signature));
    expect(lastDefinerOf(nameOf(CHARGE.signature))).toBe("0144_ask_clarify_charge.sql");
    expect(body).toMatch(/[(,]\s*p_owner uuid[,)]/u);
    expect(MOVED).toContain(CHARGE.signature);
    expect(ASKING.map(({ signature }) => signature)).not.toContain(CHARGE.signature);
    expect(patches).toEqual([PERSON_DECLARE, { old: PERSON_ANCHOR, count: 1, new: `${PERSON_GUARD}${PERSON_ANCHOR}` }]);
    expect(PERSON_GUARD).not.toMatch(/\bRAISE\b|REQUEST_OWNER_MISMATCH|request_owner_matches|UNOWNED/u);
    expect(body).not.toMatch(/request_owner_matches|UNOWNED/u);
    expect(body.indexOf(PERSON_ANCHOR)).toBeGreaterThan(body.indexOf("INSERT INTO ledger.model_spend"));
    expect(body.indexOf("INSERT INTO ledger.model_spend")).toBeGreaterThan(-1);
    // In the patched body, in this order: the ledger row, the reservation's take, the grant's question, then the person's row, whose CASE writes
    // SUBSCRIPTION for a grant dropped; and every exit but the GONE one after the ledger row.
    const patched = patches.reduce((text, patch) => text.replace(patch.old, patch.new), body);
    const order = ["INSERT INTO ledger.model_spend", "RETURNING reservation.reserved_at INTO v_admitted;", "v_admitted := COALESCE(v_admitted, pg_catalog.clock_timestamp());",
      "AND grant_row.owner_ref = p_owner", "    p_grant := NULL;\n", "INSERT INTO identity.ask_clarify_charge",
      "CASE WHEN p_grant IS NULL THEN 'SUBSCRIPTION' ELSE 'INTERNAL' END, p_grant, p_event"].map((needle) => patched.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(patched.match(/\bRETURN\b/gu)).toEqual(["RETURN", "RETURN"]);
    expect(patched).toContain("RETURN 'GONE';");
    expect(patched).toContain("RETURN 'RECORDED';");
    // Section 5 checks it by name: its guard as the inventory writes it, no owner question, its one RAISE, and what its owner may read and delete.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    expect(contract).toContain(`v_definition := pg_catalog.pg_get_functiondef('${CHARGE.signature}'::regprocedure);`);
    for (const needle of ["OR pg_catalog.strpos(v_definition, 'request_owner_matches') > 0", "OR pg_catalog.strpos(v_definition, 'REQUEST_OWNER_MISMATCH') > 0",
      "OR pg_catalog.strpos(v_definition, 'UNOWNED') > 0", "pg_catalog.has_table_privilege(v_proowner, 'identity.ask_clarify_reservation', 'DELETE')",
      "pg_catalog.has_table_privilege(v_proowner, 'billing.internal_grant', 'SELECT')", "RAISE EXCEPTION 'SECURITY_REVIEW_0171_CONTRACT F5 clarify charge';"]) {
      expect(contract, needle).toContain(needle);
    }
    expect(contract).not.toContain(`('${CHARGE.signature}', 'p_owner', `);
    expect(contract).not.toContain("v_item.kind = 'person'");
    // The header says so, and names it among what it leaves out on purpose, with the reason.
    const flat = raw.slice(0, raw.indexOf("-- 1. What this step adds")).replace(/\n-- */gu, " ");
    for (const needle of ["0144's charge writer, which asks nothing (below)", "and with none names the owner it is handed all the same, whatever session its connection presents",
      "and 0144's charge writer, which asks no owner: it is the marker's alone and runs after the call was paid, so an owner question could only leave a paid call out of its person's quota"]) {
      expect(flat, needle).toContain(needle);
    }
    for (const stale of ["UNOWNED", "only its person's row asks", "or when the helper agrees"]) expect(flat, stale).not.toContain(stale);
  });

  it("F5: the refusals it leaves alone ask no owner: none is patched or digested, the header says why, and the contract checks each body", () => {
    const raw = read(SQL_PATH);
    const flat = raw.slice(0, raw.indexOf("-- 1. What this step adds")).replace(/\n-- */gu, " ");
    const sql = code(raw);
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    const loader = read(LOADER_PATH);
    for (const { signature, step, header } of REFUSALS_LEFT) {
      expect(lastDefinerOf(nameOf(signature)), signature).toBe(step);
      expect(bodyOf(read(`migrations/${step}`), nameOf(signature)), signature).not.toContain("request_owner_matches");
      expect(inventory(raw).map((item) => item.signature), signature).not.toContain(signature);
      expect(AMENDS.flatMap(({ functions }) => [...functions]), signature).not.toContain(signature);
      expect(loader, signature).not.toContain(`"${signature}"`);
      expect(flat, signature).toContain(header);
      expect(contract, signature).toContain(`('${signature}')`);
    }
    for (const needle of ["an owner question would read a connection that is not the owner's", "every connection of a legacy debate (it names no owner)",
      "turn each refusal into an allowance"]) expect(flat, needle).toContain(needle);
    expect(contract).toContain("'SECURITY_REVIEW_0171_CONTRACT F5 refusal asks %'");
    expect(contract).toContain("pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_item.signature::regprocedure), 'identity.request_owner_matches(') > 0");
  });

  it("F5, billing: the functions keyed by a run or an owner ask the connection in their bodies, before they lock, read a grant or write; 0130's verifier stays as it is", () => {
    const raw = read(SQL_PATH);
    const items = inventory(raw);
    for (const { signature, step, owner, kind, patches } of BILLING) {
      // The step that last wrote it, the anchor once in that body, and the patches exactly as the list says; nothing earlier asked already.
      expect(lastDefinerOf(nameOf(signature)), signature).toBe(step);
      expect(items.find((item) => item.signature === signature)!.patches, signature).toEqual(patches);
      const body = bodyOf(read(`migrations/${step}`), nameOf(signature));
      expect(body, signature).not.toContain("request_owner_matches");
      expect(body, signature).not.toContain("debateai_rls_all_accounts");
      const patched = patches.reduce((text, patch) => text.split(patch.old).join(patch.new), body);
      // One question, of the owner the list names; the pin's is the marker's, once.
      if (owner === null) {
        expect(occurrences(patched, "identity.request_owner_matches("), signature).toBe(0);
        expect(occurrences(patched, MARKER), signature).toBe(1);
      } else {
        expect(occurrences(patched, "identity.request_owner_matches("), signature).toBe(1);
        expect(patched, signature).toContain(`identity.request_owner_matches(${owner})`);
        expect(occurrences(patched, MARKER), signature).toBe(0);
      }
      // The person's grant names its owner argument; the others name a row they read (the run's scope, the admitted call's, the candidate).
      if (owner === "p_owner") expect(body, signature).toMatch(new RegExp(`[(,]\\s*${owner} uuid[,)]`, "u"));
      const at = patched.indexOf(owner === null ? MARKER : "identity.request_owner_matches(");
      if (kind === "lists") {
        // The list of the owners billing stops: each row's owner, in the outer WHERE, beside the cursor and before the order and the limit.
        expect(at, signature).toBeGreaterThan(patched.indexOf(") AS candidate\n"));
        expect(at, signature).toBeLessThan(patched.indexOf("  ORDER BY candidate.owner_ref\n"));
      } else if (kind === "nothing") {
        // The readers: as for nothing stored, in the guard (or the WHERE) they had, before they read the grant, lock the person or ask the policy.
        for (const after of ["billing.read_internal_allowance(v_scope.owner_ref", "staff.funding_policy_selection", "PERFORM identity.lock_security_subjects(",
          "SELECT * INTO v_grant FROM billing.internal_grant"]) {
          if (patched.includes(after)) expect(at, `${signature}: ${after}`).toBeLessThan(patched.indexOf(after));
        }
        expect(patched, signature).not.toContain("REQUEST_OWNER_MISMATCH");
      } else if (kind === "marker") {
        // The pin: the marker's first, before it inserts or reads the scope, so no request login pins a debate to a grant.
        expect(patched, signature).toContain(`\nBEGIN\n  IF NOT ${MARKER} THEN`);
        expect(patched.slice(0, patched.indexOf("\nBEGIN\n")), signature).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|PERFORM)\b/u);
      } else {
        // The settlement and the admission: a refusal, once the owner is known, before anything is compared, locked, read of the grant or written.
        expect(patched, signature).toContain(REFUSAL);
        for (const after of ["INTERNAL_PROVIDER_FRAME_INVALID", "PERFORM pg_advisory_xact_lock(", "PERFORM identity.lock_security_subjects(",
          "billing.read_internal_allowance_for_run(", "INSERT INTO", "UPDATE ", "SELECT * INTO v_spend"]) {
          if (patched.includes(after)) expect(at, `${signature}: ${after}`).toBeLessThan(patched.indexOf(after));
        }
        expect(at, signature).toBeGreaterThan(patched.indexOf(signature.startsWith("billing.settle_") ? "SELECT * INTO v_call FROM billing.internal_provider_admission" : "v_owner:=v_scope.owner_ref;"));
      }
    }
    // The contract names each, with what it must find and the owner it asks, and refuses any billing definer a request login may call with a run or an
    // owner that asks nothing, but the two spend readers left out on purpose, the withdrawal grant, whose token gates it, and the refusals left alone.
    const sql = code(raw);
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const { signature, owner } of BILLING) {
      expect(contract, signature).toContain(`('${signature}',`);
      expect(contract, signature).toMatch(new RegExp(`,\\s*${owner === null ? "NULL" : `'${owner.replace(/[()[\]{}.*+?^$|\\]/gu, "\\$&").replace(/'/gu, "''")}'`}\\)`, "u"));
    }
    for (const refusal of ["F5 billing asks %", "F5 billing owner believed"]) expect(contract, refusal).toContain(`'SECURITY_REVIEW_0171_CONTRACT ${refusal}'`);
    expect(contract).toContain("p.proargnames && ARRAY['p_owner_ref','p_owner','p_run']::text[]");
    for (const exception of ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)",
      "billing.consume_withdrawal_grant(uuid,uuid,uuid,text)", ...REFUSALS_LEFT.map(({ signature }) => signature).filter((signature) => signature.startsWith("billing."))]) {
      expect(contract, exception).toContain(`'${exception}'::regprocedure`);
    }
    // The callers: the runner admits and settles (its provider gateway's store); the API pins on its decision pool, the room's, which is its system
    // login; billing's erasure questions are its repository's, which every billing route and sweep holds on that login (X11).
    expect(read("packages/budget/src/model-spend.ts")).toContain('"SELECT billing.reserve_internal_provider_call($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text) AS internal"');
    expect(read("apps/runner/src/run-settings.ts")).toContain("const modelSpendStore = new PostgresModelSpendStore(pool);");
    // The header says so, with what stays: the eight-argument settlement no role may call, and billing's own purges.
    const flat = raw.slice(0, raw.indexOf("-- 1. What this step adds")).replace(/\n-- */gu, " ");
    for (const needle of ["billing.reserve_internal_provider_call", "REQUEST_OWNER_MISMATCH", "record_internal_charge_scope", "decision pool", "X11", "X22",
      "four refusals, whose true their callers act on", "0093's eight-argument settlement", "which 0130's verifier does not pin",
      "moves no billing function's grants, owner, definer flag or settings"]) expect(flat, needle).toContain(needle);
    for (const stale of ["so it changes no billing function", "changes no billing function;", "Still open, a follow-up of its own: the billing functions"]) {
      expect(flat, stale).not.toContain(stale);
    }
    // n1: keeps-verifier means what it says: no new verifier, and nothing of what 0130's pins moves.
    expect(flat).toContain("keeps-verifier  it adds no effective-capability verifier");
    expect(flat).toContain("(it pins no billing body)");
  });

  it("F5, accounts: the functions keyed by a user id ask the connection before they act, the sign-up writers write only in the sign-up's own transaction, a delivery names its mail's token, and the sign-in secrets are the system login's", () => {
    const raw = read(SQL_PATH);
    const items = inventory(raw);
    for (const { signature, step, owner, kind, patches } of ACCOUNTS) {
      // The step that last wrote it, the anchor once in that body, and the patches exactly as the list says; nothing earlier asked already.
      expect(lastDefinerOf(nameOf(signature)), signature).toBe(step);
      expect(items.find((item) => item.signature === signature)!.patches, signature).toEqual(patches);
      const body = bodyOf(read(`migrations/${step}`), nameOf(signature));
      expect(body, signature).not.toContain("request_owner_matches");
      expect(body, signature).not.toContain("xmin");
      expect(body, signature).toMatch(/[(,]\s*p_user_id uuid\s*[,)]/u);
      const patched = patches.reduce((text, patch) => text.split(patch.old).join(patch.new), body);
      expect(patched, signature).not.toContain("REQUEST_OWNER_MISMATCH");
      if (kind === "creates") {
        // The sign-up writers: the account's row was written by this transaction, beside the state they asked; no session is asked, as none exists yet.
        expect(occurrences(patched, "identity.request_owner_matches("), signature).toBe(0);
        expect(occurrences(patched, `identity_user.xmin${signature.includes("italy") ? " = " : "="}${OWN_TRANSACTION}`), signature).toBe(1);
        expect(patched.indexOf("xmin"), signature).toBeLessThan(patched.indexOf("INSERT INTO"));
        continue;
      }
      // One question, of the owner the list names: the account the body locked or read, or the user id's own account for a reader with no such row.
      expect(occurrences(patched, "identity.request_owner_matches("), signature).toBe(1);
      expect(patched, signature).toContain(`identity.request_owner_matches(${owner})`);
      const at = patched.indexOf("identity.request_owner_matches(");
      if (kind === "reads") {
        // A reader answers as for nothing stored, in the WHERE it had; it stays the plain reader it was.
        expect(body, signature).toMatch(/\bSTABLE\b/u);
        expect(patched, signature).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/u);
      } else {
        // A writer asks before it updates, inserts or audits anything of the account's, and answers as for an account with nothing to act on.
        for (const after of ["UPDATE ", "INSERT INTO", "SELECT session.session_id", "PERFORM 1 FROM identity.session", "RAISE EXCEPTION 'DATA_EXPORT_LINK_INVALID'"]) {
          if (patched.includes(after)) expect(at, `${signature}: ${after}`).toBeLessThan(patched.indexOf(after));
        }
      }
    }
    // The contract names each, with what it must find and the owner it asks (none: the sign-up writers').
    const sql = code(raw);
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const { signature, owner } of ACCOUNTS) {
      expect(contract, signature).toContain(`('${signature}',`);
      expect(contract, signature).toMatch(new RegExp(`,\\s*${owner === null ? "NULL" : `'${owner.replace(/[()[\]{}.*+?^$|\\]/gu, "\\$&").replace(/'/gu, "''")}'`}\\)`, "u"));
    }
    expect(contract).toContain("'SECURITY_REVIEW_0171_CONTRACT F5 account asks %'");
    expect(contract).toContain("'SECURITY_REVIEW_0171_CONTRACT F5 delivery %'");
    // The delivery's overload: 0085's body, and before it touches the channel, the mail's own token among the account's verification credentials.
    const overload = bodyOf(sql, "identity.record_verification_delivery_with_audit");
    const original = bodyOf(code(read("migrations/0085_staff_access_foundation.sql")), "identity.record_verification_delivery_with_audit");
    const token = "  IF NOT EXISTS (SELECT 1 FROM identity.verification_token_credential AS credential\n"
      + "      WHERE credential.channel_binding_id=v_channel.channel_binding_id AND credential.token_hash=p_token_hash) THEN\n"
      + "    PERFORM identity.consume_runtime_audit_attempt();\n    RETURN false;\n  END IF;\n";
    expect(overload).toContain(token);
    expect(overload.indexOf(token)).toBeLessThan(overload.indexOf("UPDATE identity.channel_binding"));
    expect(overload.indexOf(token)).toBeGreaterThan(overload.indexOf("FROM identity.lock_account_t9_internal(v_channel.user_id,false);"));
    const tail = (text: string): string => text.slice(text.indexOf("DECLARE v_channel record;"));
    expect(tail(overload).replace(token, "")).toBe(tail(original));
    expect(sql).toContain("WHERE p.oid = 'identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)'::regprocedure");
    // The API: the delivery names the token the mail carried; the five sign-in and recovery calls run on the repositories' system login (X36).
    expect(read("apps/api/src/registration.ts")).toContain('tokenHash: hashToken("verification", input.token),');
    expect(read("packages/db/src/consumer-auth.ts")).toContain("crossAccount(\"X36\"");
    expect(read("packages/db/src/consumer-recovery.ts")).toContain("crossAccount(\"X36\"");
    expect(read("packages/db/src/identity.ts")).toContain("crossAccount(\"X36\"");
    // The header says what holds now, and what stays open.
    const flat = raw.slice(0, raw.indexOf("-- 1. What this step adds")).replace(/\n-- */gu, " ");
    for (const needle of ["X36", "pg_current_xact_id", "the token the mail carried", "record_verification_delivery_with_audit", "answer as for nothing stored",
      "consume_recovery_code_with_audit", "complete_consumer_passkey_login", "prove_consumer_recovery"]) expect(flat, needle).toContain(needle);
    expect(flat).not.toContain("the sign-in flows, gated by the password, factor, receipts or tokens they are handed");
  });

  it("F2: a dig is refused its key's provision and left out of the Free sweep; the API asks first, through one owner-scoped reader", () => {
    const raw = read(SQL_PATH);
    const sql = code(raw);
    const items = inventory(raw).filter(({ fix }) => fix === "F2");
    expect(items).toEqual([{ fix: "F2", ...MARKING },
      ...REFUSING.map(({ signature, old, new: replacement }) => ({ fix: "F2", signature, patches: [{ old, new: replacement, count: 1 }] })),
      { fix: "F2", ...FORGETTING }]);
    // In 0085's key provision (0099 patched it in place and nothing restated it since), the refusal stands after the owner's and the live content's
    // checks and before the link's tombstone and the intent are written; the transition publishes only under that PREPARED intent.
    expect(lastDefinerOf("serve.prepare_publication_key_provision")).toBe("0085_staff_access_foundation.sql");
    const provision = bodyOf(read("migrations/0085_staff_access_foundation.sql"), "serve.prepare_publication_key_provision");
    expect(provision.indexOf(REFUSING[0].old)).toBeGreaterThan(provision.indexOf("core.run_is_owned_by(p_run_id,p_owner_ref,NULL)"));
    expect(provision.indexOf(REFUSING[0].old)).toBeLessThan(provision.indexOf("INSERT INTO core.publication_ref_tombstone"));
    expect(provision.indexOf(REFUSING[0].old)).toBeLessThan(provision.indexOf("INSERT INTO serve.publication_key_provision_intent"));
    const transition = bodyOf(read("migrations/0085_staff_access_foundation.sql"), "core.transition_run_publication");
    expect(transition).toContain("AND provision.cleanup_state='PREPARED' AND provision.expires_at>v_now");
    // The helper: the dig's own row, or any one of the four other records a dig may leave; the owner's reader asks 0131's rule (and so, since F5,
    // the session's owner) first.
    const helper = bodyOf(sql, "identity.run_is_dig");
    expect(helper).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    for (const record of ["FROM identity.dig_run AS mark WHERE mark.run_id = chain.run_id",
      "FROM identity.dig_pick_set AS picks WHERE picks.run_id = chain.run_id",
      "FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = chain.run_id",
      "FROM identity.investigation_member AS member WHERE member.run_id = chain.run_id AND member.parent_run_id IS NOT NULL",
      "FROM identity.dig_link AS link WHERE link.child_run_id = chain.run_id"]) expect(helper, record).toContain(record);
    // The debate itself and every run it re-admits, back along 0123's edges (old run to new), at most 16, as core.resolve_run_ref goes forward.
    expect(helper).toContain("SELECT p_run_id, 0 WHERE p_run_id IS NOT NULL");
    expect(helper).toContain("SELECT edge.old_run_id, chain.hops + 1 FROM core.run_supersession AS edge JOIN chain ON edge.new_run_id = chain.run_id WHERE chain.hops < 16");
    expect(bodyOf(read("migrations/0123_side_by_side_releases.sql"), "core.resolve_run_ref")).toContain("IF v_hops > 16 THEN");
    // Every live function that writes a publication's snapshot is one of the two, and each writes it only past a refusal of a dig: the transition under
    // the key provision's PREPARED intent, the Free publish after its claim.
    const writers = new Set<string>();
    for (const step of [...earlierSteps(), NAME]) {
      const source = code(read(`migrations/${step}`));
      for (const mention of source.matchAll(/INSERT INTO serve\.publication_snapshot\b/gu)) {
        const creates = [...source.slice(0, mention.index ?? 0).matchAll(/CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+\.[a-z_0-9]+)\(/gu)];
        writers.add(creates.at(-1)?.[1] ?? `${step}: outside any function`);
      }
    }
    const live = [...writers].filter((name) => bodyOf(code(read(`migrations/${lastDefinerOf(name)!}`)), name).includes("INSERT INTO serve.publication_snapshot"));
    expect(live.sort()).toEqual([...SNAPSHOT_WRITERS].sort());
    const freePublish = bodyOf(read("migrations/0137_public_debates.sql"), "core.publish_free_debate");
    expect(freePublish.indexOf("v_owner := identity.claim_free_public_ask(p_run_id);")).toBeGreaterThan(-1);
    expect(freePublish.indexOf("v_owner := identity.claim_free_public_ask(p_run_id);")).toBeLessThan(freePublish.indexOf("INSERT INTO serve.publication_snapshot"));
    const freePrepare = bodyOf(read("migrations/0137_public_debates.sql"), "core.prepare_free_publication");
    expect(freePrepare.indexOf("v_owner := identity.claim_free_public_ask(p_run_id);")).toBeGreaterThan(-1);
    expect(freePrepare.indexOf("v_owner := identity.claim_free_public_ask(p_run_id);")).toBeLessThan(freePrepare.indexOf("INSERT INTO serve.publication_key_provision_intent"));
    const reader = bodyOf(sql, "identity.read_run_is_dig");
    expect(reader).toContain("LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    // A refusal, so it fails closed: a connection that is not the owner's reads every debate as a dig (one constant, whatever the run), asked first;
    // the owner's own connection, or a marker login with no session, reads 0131's rule and then the debate's own answer.
    expect(reader).toContain(["SELECT CASE WHEN NOT identity.request_owner_matches(p_owner_ref) THEN true",
      "    WHEN identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN identity.run_is_dig(p_run_id) END"].join("\n"));
    expect(reader.match(/\bTHEN true\b/gu)).toHaveLength(1);
    // The contract checks each refusal and that each one's owner may ask.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const { signature } of REFUSING) expect(contract, signature).toContain(`('${signature}', `);
    for (const refusal of ["F2 refuses %", "F2 Free path %", "F2 re-admission", "F2 key provision order", "F2 review order", "F2 dig row", "F2 dig row reachable %",
      "F2 dig row at creation", "F2 dig row backfill", "F2 dig row forget"]) {
      expect(contract, refusal).toContain(`'SECURITY_REVIEW_0171_CONTRACT ${refusal}'`);
    }
    // The API: the publish route asks right after the grant's check, before the answer is read under the content lease and before the synthesis gate.
    const api = read("apps/api/src/index.ts");
    const route = api.slice(api.indexOf('"/v1/runs/:id/publish",'), api.indexOf("const publicationReviewOwner"));
    const asked = route.indexOf("await options.publications.isDig?.({ runId, authenticated }) === true");
    expect(asked).toBeGreaterThan(route.indexOf("auditPreflightDenial("));
    expect(asked).toBeLessThan(route.indexOf("contentLease.run(contentLease.readAnswer)"));
    expect(asked).toBeLessThan(route.indexOf(".decide({"));
    expect(route).toContain("reply.status(409).send(DigNotPublishableSchema.parse({ error: DIG_NOT_PUBLISHABLE, message: DIG_NOT_PUBLISHABLE }))");
    // The application asks again before the judge; the repository reads through the one owner-scoped reader.
    const application = read("apps/api/src/publications.ts");
    const stage = application.slice(application.indexOf("private async stagePublication("), application.indexOf("private async commitPublication("));
    expect(stage.indexOf("readRunIsDig(")).toBeGreaterThan(stage.indexOf("await this.preflightGrant("));
    expect(stage.indexOf("readRunIsDig(")).toBeLessThan(stage.indexOf("buildPublicDebateBody("));
    const repository = read("packages/db/src/publication.ts");
    expect(repository.match(/identity\.read_run_is_dig\(/gu)).toHaveLength(2);
    expect(repository).not.toContain("identity.run_is_dig(");
    // The contract: the refusal's code, strict; the visibility read's own schema, which the publish's 201 does not share.
    const contractSource = read("packages/contract/src/index.ts");
    expect(contractSource).toContain('export const DIG_NOT_PUBLISHABLE = "DIG_NOT_PUBLISHABLE" as const;');
    const refusalSchema = contractSource.slice(contractSource.indexOf("export const DigNotPublishableSchema"), contractSource.indexOf("export type DigNotPublishable ="));
    expect(refusalSchema).toContain(".strict()");
    expect([...refusalSchema.matchAll(/^  ([a-z_]+):/gmu)].map((match) => match[1])).toEqual(["error", "message"]);
    const visibility = contractSource.slice(contractSource.indexOf("export const RunVisibilitySchema"), contractSource.indexOf("export type RunVisibility ="));
    expect(visibility).toContain("dig: z.boolean().optional()");
    expect(visibility).toContain(".strict()");
    // The owner's ask for the team's approval answers the same refusal, right after the grant's check, before the answer is read, the verdict of
    // record asked or the repository called; and the database's ask refuses a dig before it consumes the grant or queues a request.
    const owner = read("apps/api/src/publication-review/owner.ts");
    const review = owner.slice(owner.indexOf("async ask(input: AskInput)"), owner.indexOf("async read(input: OwnerInput)"));
    const reviewAsked = review.indexOf("await deps.publications.isDig?.({ runId: input.runId, authenticated: input.authenticated }) === true");
    expect(reviewAsked).toBeGreaterThan(review.indexOf("await deps.auditDenial("));
    expect(reviewAsked).toBeLessThan(review.indexOf("await deps.readOwnedAnswer(input)"));
    expect(review).toContain("DigNotPublishableSchema.parse({ error: DIG_NOT_PUBLISHABLE, message: DIG_NOT_PUBLISHABLE })");
    const reviewAsk = bodyOf(read("migrations/0127_publication_review.sql"), "serve.ask_publication_review");
    expect(reviewAsk.indexOf(REFUSING[1].old)).toBeGreaterThan(reviewAsk.indexOf("THEN RETURN 'GRANT_INVALID'; END IF;"));
    expect(reviewAsk.indexOf(REFUSING[1].old)).toBeLessThan(reviewAsk.indexOf("UPDATE identity.step_up_grant g SET consumed_at=clock_timestamp()"));
    expect(reviewAsk.indexOf(REFUSING[1].old)).toBeLessThan(reviewAsk.indexOf("INSERT INTO serve.publication_review_request"));
    // The page's resumed proof says so in words it already has, never that the proof failed.
    const resume = read("apps/ui/components/auth/SecurityActionResume.tsx");
    expect(resume.match(/serverCode === 'DIG_NOT_PUBLISHABLE'/gu)).toHaveLength(2);
    const transitionAt = contractSource.indexOf("export const PublicationTransitionSchema");
    const transitionSchema = contractSource.slice(transitionAt, contractSource.indexOf("}).strict();", transitionAt));
    expect([...transitionSchema.matchAll(/^  ([a-z_]+):/gmu)].map((match) => match[1])).toEqual(["state", "public_ref"]);
    expect(route).toContain("PublicationTransitionSchema.parse(published)");
  });

  it("F2: a dig is marked a dig by the statement that creates its run, those before the step are marked as it applies, and only its own deletion or its account's takes the mark", () => {
    const raw = read(SQL_PATH);
    const sql = code(raw);
    // The row: the dig's run, its owner and the time; no parent. It goes with the account (the cascade).
    const table = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity.dig_run ("), sql.indexOf(");", sql.indexOf("CREATE TABLE IF NOT EXISTS identity.dig_run (")));
    expect(table.split("\n").slice(1).map((line) => line.trim()).filter((line) => line !== "")).toEqual(["run_id uuid PRIMARY KEY,",
      'owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,', "recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()"]);
    expect(sql).toContain("ALTER TABLE identity.dig_run OWNER TO %I', v_owner");
    // Its one writer is the run's creation (0123's writer, the encrypted run's only one since 0040), which takes the mark in its document as one
    // more key of its closed list, refuses any value but JSON true, and writes the row right after the run's ownership event and before the run's
    // key provision is completed: one statement, so no sign-out, step-up, failure or crash after it can part a dig from its row.
    expect(lastDefinerOf("core.create_encrypted_run")).toBe("0163_carry_on_session_free_digs.sql");
    let writer = bodyOf(read("migrations/0163_carry_on_session_free_digs.sql"), "core.create_encrypted_run");
    for (const patch of MARKING.patches) writer = writer.replace(patch.old, patch.new);
    const marked = "INSERT INTO identity.dig_run (run_id, owner_ref) VALUES (v_run_id, p_owner_ref) ON CONFLICT (run_id) DO NOTHING;";
    expect(occurrences(writer, marked)).toBe(1);
    expect(writer.indexOf(marked)).toBeGreaterThan(writer.indexOf("  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);\n"));
    expect(writer.indexOf(marked)).toBeLessThan(writer.indexOf("IF NOT core.complete_run_key_provision("));
    expect(writer.indexOf("OR (p_run ? 'digRun' AND p_run->'digRun' IS DISTINCT FROM 'true'::jsonb) THEN\n    RETURN false;")).toBeGreaterThan(-1);
    expect(writer.indexOf("OR (p_run ? 'digRun'")).toBeLessThan(writer.indexOf("INSERT INTO core.run_content_attestation_secret"));
    // No other writer: in the step only the backfill below (before the patches) and this patch's own text in the inventory, none after it; not in
    // the code either (the asks route's write after the submit and its function are gone).
    const patchesAt = sql.indexOf("DO $security_review_patch$");
    const contractAt = sql.indexOf("DO $security_review_contract$");
    expect(sql.slice(0, patchesAt).match(/INSERT INTO identity\.dig_run\b/gu)).toHaveLength(1);
    expect(sql.slice(patchesAt, sql.indexOf("$security_review_patch$;", patchesAt)).match(/INSERT INTO identity\.dig_run\b/gu)).toHaveLength(1);
    expect(sql.slice(sql.indexOf("$security_review_patch$;", patchesAt), contractAt)).not.toMatch(/INSERT INTO identity\.dig_run\b/u);
    expect(raw).not.toContain("record_dig_run");
    for (const path of ["apps/api/src/index.ts", "apps/api/src/dig-admission.ts", "apps/api/src/account-memory.ts", "apps/api/src/main.ts"]) {
      expect(read(path), path).not.toMatch(/record_dig_run|recordDigRun|DigRunPort|DIG_RUN_/u);
    }
    // The repository sends the mark only for an owner's run, refusing a legacy asker's dig before any query; the application marks the run of an
    // ask with a parent or a public parent, on the direct path and the room's alike (START and WAIT write the run in the same call).
    const repository = read("packages/db/src/index.ts");
    const insertRun = repository.slice(repository.indexOf("  async #insertRun("), repository.indexOf("  async readLoadingProjection("));
    expect(insertRun.indexOf("throw new TypedDomainError(\"RUN_DIG_REQUIRES_OWNER\"")).toBeGreaterThan(-1);
    expect(insertRun.indexOf("throw new TypedDomainError(\"RUN_DIG_REQUIRES_OWNER\"")).toBeLessThan(insertRun.indexOf("await planTierColumnIsApplied(this.pool)"));
    expect(occurrences(insertRun, "...(input.digRun === true ? { digRun: true } : {})")).toBe(1);
    const api = read("apps/api/src/index.ts");
    const application = api.slice(api.indexOf("  async submit(\n    requestedAsk: AskRequest,"), api.indexOf("  async #submitWithRoom("));
    expect(application).toContain("const digRun = principal.kind === \"server\" && (requestedAsk.parent !== undefined || requestedAsk.public_parent !== undefined);");
    const room = api.slice(api.indexOf("  async #submitWithRoom("), api.indexOf("  async #submitWithRoom(") + 12_000);
    for (const [path, text] of [["direct", application], ["room", room]] as const) {
      const start = text.indexOf("this.#runs.startRun({");
      expect(start, path).toBeGreaterThan(-1);
      // The direct path writes "},lease.client)", the room's "}, lease.client)": the call ends at the first of either.
      const end = start + text.slice(start).search(/\},\s?lease\.client\)/u);
      expect(end, path).toBeGreaterThan(start);
      expect(occurrences(text.slice(start, end), "...(digRun ? { digRun: true as const } : {})"), path).toBe(1);
    }
    // 0131's per-debate forget takes the erased debate's own row, after its links, under the lock it already holds; never a row by its parent.
    const forget = bodyOf(read("migrations/0131_v4_account_memory.sql"), "identity.forget_erased_debate_page_memory");
    const links = "  DELETE FROM identity.dig_link AS link WHERE link.parent_run_id = p_run_id OR link.child_run_id = p_run_id;\n  GET DIAGNOSTICS v_links = ROW_COUNT;\n";
    expect(forget).toContain(`${links}${FORGETTING.patches[1].old}`);
    expect(forget.indexOf("pg_advisory_xact_lock")).toBeLessThan(forget.indexOf(links));
    expect(FORGETTING.patches[1].new).not.toMatch(/parent/u);
    // A dig made before the step is marked as it applies, from the four records it left and its run's owner now, unless the run was erased or the
    // owner is gone; nothing published is touched (the README says what the operator does about those).
    const backfill = sql.slice(sql.indexOf("INSERT INTO identity.dig_run (run_id, owner_ref)\n  SELECT"), sql.indexOf("ON CONFLICT (run_id) DO NOTHING;", sql.indexOf("INSERT INTO identity.dig_run (run_id, owner_ref)\n  SELECT")));
    for (const record of ["SELECT picks.run_id FROM identity.dig_pick_set AS picks", "SELECT contribution.dig_run_id FROM identity.public_contribution AS contribution",
      "SELECT member.run_id FROM identity.investigation_member AS member WHERE member.parent_run_id IS NOT NULL", "SELECT link.child_run_id FROM identity.dig_link AS link",
      "FROM core.run_ownership_event AS event WHERE event.run_id = dig.run_id ORDER BY event.at_seq DESC LIMIT 1",
      "EXISTS (SELECT 1 FROM identity.\"user\" AS account WHERE account.owner_ref = owner_now.owner_ref)",
      "NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS erased WHERE erased.run_id = dig.run_id)"]) expect(backfill, record).toContain(record);
    expect(sql.indexOf("INSERT INTO identity.dig_run (run_id, owner_ref)\n  SELECT")).toBeGreaterThan(sql.indexOf("SELECT core.install_truncate_guard('identity.dig_run');"));
    expect(sql).not.toMatch(/INSERT INTO core\.run_visibility_event|UPDATE serve\.publication_snapshot|DELETE FROM serve\.publication_snapshot/u);
    // The contract checks the row, the mark at creation and what its owner may do, the backfill, and the forget; and says how many digs were public.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    expect(contract).toContain("'identity.dig_run'::regclass");
    expect(contract).toContain("pg_catalog.has_table_privilege(v_proowner, 'identity.dig_run', 'INSERT')");
    expect(contract).toContain("pg_catalog.has_function_privilege(v_proowner, 'identity.run_is_dig(uuid)', 'EXECUTE')");
    expect(contract).toContain("'identity.forget_erased_debate_page_memory(uuid)'::regprocedure");
    expect(contract).toContain("RAISE NOTICE 'SECURITY_REVIEW_0171 F2 % digs published before this step stay published");
  });

  it("F5: the site's day is the system's to write: the runless writers and the day's tables move to the marker, the counter's allocator becomes a definer, and the contract checks each", () => {
    const sql = code(read(SQL_PATH));
    // The day's three tables: their INSERT moves, one REVOKE and one GRANT a table; their SELECT stays where it was.
    for (const relation of DAY_TABLES) {
      expect(sql, relation).toContain(`REVOKE INSERT ON ${relation} FROM debateai_runtime;\nGRANT INSERT ON ${relation} TO debateai_rls_all_accounts;`);
    }
    expect(sql).not.toMatch(/REVOKE (?:ALL|SELECT)[^;]* ON ledger\./u);
    // The counter: its allocator becomes a definer of its owner, nothing else of it changes (0056's search path, its owner, its callers), and the
    // UPDATE on the row is taken from debateai_runtime.
    expect(sql).toContain("ALTER FUNCTION ledger.allocate_sequence() SECURITY DEFINER;\nREVOKE UPDATE ON ledger.sequence_allocator FROM debateai_runtime;");
    expect(sql).not.toMatch(/ALTER FUNCTION ledger\.allocate_sequence\(\) (?:SET|RESET|OWNER)/u);
    expect(sql).not.toMatch(/ON FUNCTION ledger\.allocate_sequence\(\)/u);
    // No step's postcondition digests the allocator (0000 is older than the chain), so this one's does; core.work_item's grant is left as it is.
    expect(read(LOADER_PATH)).toContain('"ledger.allocate_sequence()"');
    expect([...pinnedBy().values()].some((functions) => functions.includes("ledger.allocate_sequence()"))).toBe(false);
    expect(sql).not.toMatch(/ON core\.work_item/u);
    // The contract: no request role inserts into a day table and the marker does; the only request-callable definers that write the day are 0107's
    // settlement and 0158's charge before Start (which arrived with the second merge of the V4 line and this step leaves alone); the allocator's shape and callers; no request role writes the counter; the work queue's rule; and the spend readers ask with no
    // exception left.
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    for (const needle of ["ARRAY['ledger.model_spend', 'ledger.model_spend_hold', 'ledger.model_spend_reservation']",
      "pg_catalog.has_table_privilege(candidate.role, v_role, 'INSERT')", "NOT pg_catalog.has_table_privilege('debateai_rls_all_accounts', v_role, 'INSERT')",
      "p.prosrc ~ 'INSERT INTO ledger\\.model_spend(_hold|_reservation)?\\M'",
      "IS DISTINCT FROM ARRAY['billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)',\n      'identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)']",
      "p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, pg_temp']",
      "ARRAY['debateai_evaluator_api','debateai_evaluator_worker','debateai_runtime','debateai_settlement_watch']",
      "'ledger.sequence_allocator', 'UPDATE,DELETE,TRUNCATE'", "'rls.owns_run(run_id)'"]) expect(contract, needle).toContain(needle);
    expect(contract).not.toContain("p.oid NOT IN ('identity.read_ask_clarify_spent");
    // The API's sites: each runless writer's record and probe on its site's pool, the reservation on the request pool, the synthesis check's charge
    // on X33 (the sites test pins their counts); and the room's count of the site's holds in the X23 frame beside its day's spend.
    const main = read("apps/api/src/main.ts");
    for (const call of ['languageCheckSpendWriterPresent(crossAccountPool(pool, "X30"))', 'recordLanguageCheckSpend(crossAccountPool(pool, "X30"), entry)',
      'questionCheckSpendWriterPresent(crossAccountPool(pool, "X31"))', 'recordQuestionCheckSpend(crossAccountPool(pool, "X31"), entry)',
      'askClarifyChargeWriterPresent(crossAccountPool(pool, "X32"))', 'recordAskClarifyCharge(crossAccountPool(pool, "X32"), entry)',
      "onOwnConnections(() => askClarifyReservationPresent(pool))", "reserveAskClarifyCharge(pool, entry)",
      'new PostgresModelSpendStore(crossAccountPool(pool, "X33")).recordSpend(']) expect(main, call).toContain(call);
    const spend = read("packages/budget/src/model-spend.ts");
    const holds = spend.slice(spend.indexOf("async readSiteCountedHoldsMicros("), spend.indexOf("async readOwnerSpentMicros("));
    expect(holds).toContain('return crossAccount("X23", async () => {');
  });

  it("the contract block checks every list as the step applies, naming each fix", () => {
    const sql = read(SQL_PATH);
    const contract = sql.slice(sql.indexOf("DO $security_review_contract$"), sql.indexOf("$security_review_contract$;"));
    expect(contract.length).toBeGreaterThan(0);
    for (const { fix, signature } of ADDED) expect(contract, signature).toContain(`('${fix}', '${signature}'`);
    for (const { fix, signature } of REVOKED.filter((item) => !NARROWED.some((narrowed) => narrowed.signature === item.signature))) {
      expect(contract, signature).toContain(`('${fix}', '${signature}')`);
    }
    expect(contract).toContain(`ARRAY[${ROLES.map((role) => `'${role}'`).join(",")}]`);
    expect(contract).toContain("pg_catalog.has_function_privilege(v_role, v_item.signature, 'EXECUTE')");
    expect(contract).toContain("'SECURITY_REVIEW_0171_CONTRACT F4b read_public_review'");
    expect(sql.trimEnd().endsWith("$security_review_contract$;")).toBe(true);
  });

  it("discloses its grant, records what it takes back, lists its loader and its suite, and is documented truthfully as drained with what it amends", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }>;
      privilegeRevocations: Array<{ roleName: string; source: string; revokes: string[] }> };
    // One entry a role, in the file's order, as the manifest's other steps group theirs.
    const byRole = (rows: readonly Readonly<{ role: string; signature: string }>[]) => [...new Set(rows.map(({ role }) => role))]
      .map((role) => [role, rows.filter((row) => row.role === role).map(({ signature }) => `EXECUTE ON FUNCTION ${signature}`)]);
    // F5's day tables close their role's entry: the marker's INSERT after its function grants, debateai_runtime's INSERT and UPDATE after its revokes.
    const withTables = (groups: ReturnType<typeof byRole>, role: string, rights: readonly string[]) =>
      groups.map(([name, rows]) => [name, name === role ? [...(rows as string[]), ...rights] : rows]);
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH).map(({ roleName, grants }) => [roleName, grants]))
      .toEqual(withTables(byRole(GRANTED.map(({ signature, grantee }) => ({ role: grantee, signature }))), "debateai_rls_all_accounts",
        DAY_TABLES.map((relation) => `INSERT ON ${relation}`)));
    expect(manifest.privilegeRevocations.filter((entry) => entry.source === SQL_PATH).map(({ roleName, revokes }) => [roleName, revokes]))
      .toEqual(withTables(byRole(REVOKED), "debateai_runtime", TABLE_REVOKED));
    // 0137's own disclosure stays as 0137 granted it.
    expect(manifest.privilegeDisclosures.find((entry) => entry.source === "migrations/0137_public_debates.sql" && entry.roleName === "debateai_billing_runtime")!.grants)
      .toContain("EXECUTE ON FUNCTION identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)");
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/security-review-hardening-database.test.ts");
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0171, below) the sixty-first");
    const heading = "## The security review's fixes in the database (0171)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["sixty-first", "renumbered to 0171", NAME, "security-review-hardening-forward0171.json", LOADER_PATH, "`loadForward0171`", "MIGRATION_FORWARD0171_",
      "-- n1: drained", "-- n1: keeps-verifier", "amendsPostconditionsOf", "function_definition", "privilegeRevocations", "F3", "F4a", "F4b",
      "`identity.private_forget_scope`", "`open_forget_scope`", "`close_forget_scope`", "`forget_scope_open`", "0080", "0084",
      "F2", "`identity.run_is_dig`", "`identity.read_run_is_dig`", "`identity.dig_run`", "`core.create_encrypted_run`", "`digRun`", "`serve.prepare_publication_key_provision`", "`read_free_debates_to_publish`", "`DIG_NOT_PUBLISHABLE`",
      "`serve.ask_publication_review`", "`record_free_public_ask`", "public review's `HIDE`",
      "`claim_free_public_ask`", "`core.run_supersession`", "grants of 0132 to 0153",
      "F5", "`identity.request_owner_matches`", "`identity.reserve_ask_clarify_charge`", "`identity.ask_clarify_reservation`", "`rls.context_owner_ref()`", "`debateai_rls_all_accounts`",
      "`REQUEST_OWNER_MISMATCH`", "`page_memory_run_owned`", "`identity.delete_ask_clarify_reservations_due`", "`ASK_CLARIFY_CHARGE_TAKEN`",
      "`billing.internal_grant`", "`ledger.record_language_check_spend`", "`ledger.record_question_check_spend`",
      "`identity.public_flag_site_limits`", "`PUBLIC_FLAG_LIMITS_UNRESOLVED`", "X38", "stays `CHECKING`", "`record_provider_probe`", "X37",
      "`release_alert_delivery` stays `debateai_runtime`'s", "`legal.purge_expired_acceptance`", "X14", "`mappingPool`", "`ELEVATION`", "`read_account_security_hold`",
      ...TAKEN.map(({ signature }) => `\`${nameOf(signature).slice(nameOf(signature).indexOf(".") + 1)}\``),
      ...SPEND_READERS.map((name) => `\`${name}\``),
      ...AMENDS.map((amendment) => amendment.step.slice(0, 4))]) expect(section, needle).toContain(needle);
    for (const { functions } of AMENDS) for (const signature of functions) expect(section, signature).toContain(`\`${nameOf(signature).slice(nameOf(signature).indexOf(".") + 1)}\``);
    // A reservation its charge never takes goes as section 1 of the step says: with anyone's later reservations once an hour old, or the API's
    // hourly sweep, never with its owner's; and the grant a charge names is kept only when it is the person's own.
    expect(section).toContain("goes once it is an hour old with the reservations made after, whoever makes them, each taking up to 100 such rows of any owner, the oldest first, or with the API's hourly sweep");
    expect(section).toContain("keeps the grant the API names only when it is that person's own, by its configured event, and was running when the call was reserved");
    // The site's day: the writers and the day's tables are the system's, the room counts every account's holds, the counter's allocator is a
    // definer, the work queue stays row-bound, and what stays open of it.
    for (const needle of ["The site's day of spend is the system's to write", "`ledger.model_spend_hold`", "`ledger.model_spend_reservation`", "X30", "X31", "X32", "X33",
      "`readSiteCountedHoldsMicros`", "`ledger.allocate_sequence()`", "`ledger.sequence_allocator`", "`core.work_item`", "`settle_internal_provider_call`",
      "at any size", "spend waiver"]) expect(section, needle).toContain(needle);
    expect(section).not.toContain("a known exposure older than this step");
    // A member's grant totals need only the member's owner ref, as the funding basis names a funded debate's grant and event to any request.
    expect(section).toContain("so only the member's owner ref, which 0130's row rule keeps from every request");
    expect(section).not.toContain("configured event, which no request may read");
    // The helper's staff grant serves the billing definers that ask too; the step redefines no 0091 function (0091's erasure question is left
    // alone); and its postcondition's counts are the loader's: eleven functions of its own, twelve account functions, sixty-two in all.
    expect(section).toContain("whose `reserve_ask_clarify_charge`, `read_ask_clarify_spent` and five billing definers");
    expect(section).toContain("redefines in place functions of 0040, 0077, 0078, 0079, 0085, 0089, 0092, 0095, 0107,");
    expect(section).toContain("its own three tables and eleven functions (the delivery's overload among them), the lock, the key provision, the six billing "
      + "functions, the twelve account functions, those thirty and the allocator");
    const forward = read(LOADER_PATH);
    const digested = forward.slice(forward.indexOf("const FUNCTIONS"), forward.indexOf("];", forward.indexOf("const FUNCTIONS")))
      .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    expect(digested.match(/["'][a-z_]+\.(?:"[a-z_]+"|[a-z_]+)\([^)]*\)["']/gu)).toHaveLength(11 + 1 + 1 + 6 + 12 + 30 + 1);
    for (const stale of ["0085, 0089, 0091, 0092, 0095", "three tables and ten functions", "the eleven account functions"]) expect(section, stale).not.toContain(stale);
    // The census's own comment names the one record of the site it leaves alone (0048's probe writer left the census for the marker).
    expect(read("tests/integration/security-review-hardening-database.test.ts")).not.toContain("two records of the site");
    // The charge writer asks nothing of the connection: with no reservation it names the owner it is handed, so no paid call is left out of a quota.
    expect(section).toContain("and with none names the owner it is handed, whatever session its connection presents");
    for (const stale of ["UNOWNED", "and only its person's row asks", "whose `record_ask_clarify_charge` and"]) expect(section, stale).not.toContain(stale);
    // The provider probe's writer is the marker's now, so the README no longer names it open beside the refusal audits.
    expect(section).not.toContain("and record a provider's probe, which the step's header names open");
    // The billing functions keyed by a run or an owner ask in their bodies, which 0130's verifier does not pin, and what keeps-verifier means now.
    for (const { signature } of BILLING) expect(section, signature).toContain(`\`${nameOf(signature).slice("billing.".length)}\``);
    for (const needle of ["which 0130's verifier does not pin", "Keeps-verifier because it adds no effective-capability verifier", "(it pins no billing body)",
      "its decision pool", "(X22)", "(X11)", "0093's eight-argument settlement"]) expect(section, needle).toContain(needle);
    for (const stale of ["Still open, a follow-up of its own: the billing functions", "so it changes no billing function", "this step keeps that verifier and changes no billing function"]) {
      expect(section, stale).not.toContain(stale);
    }
    const preview = read("deploy/preview-auth-dev/v1/README.md");
    expect(preview).toContain(`\`migrations/${NAME}\` (after \`${PREVIOUS}\`, \`n1: drained\`)`);
    for (const needle of ["`identity.delete_ask_clarify_reservations_due`", "the person's own grant", "within the hour", "X38", "`identity.public_flag_site_limits`", "X14",
      "0112's release stays the runtime's", "the billing functions keyed by a run or an owner ask too", "X22", "X11", "the site's day of spend is the system's to write",
      "X30 to X32", "X33", "`ledger.allocate_sequence()`", "`core.record_provider_probe`", "X37"]) {
      expect(preview, needle).toContain(needle);
    }
    // The round-4 wording of the flag's settlement, which named the forged AGREE open, is gone from both: the settlement is the system login's now.
    expect(section).not.toContain("cannot tell the judge's `AGREE` from one its caller made up");
    expect(preview.replace(/\s+/gu, " ")).not.toContain("a flag's settlement closes or hides only for its reporter");
    expect(preview.replace(/\s+/gu, " ")).not.toContain("the billing functions and a bound on the three runless ledger writers");
  });
});
