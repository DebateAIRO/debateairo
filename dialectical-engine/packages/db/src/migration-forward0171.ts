import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { ForwardStepAnchor, ForwardStepPlan } from "./migration-forward-chain.js";

/**
 * 0171, the security review's fixes in the database (the review of 3 Nov 2026; drained): the tables and helpers its patched bodies use, the earlier bodies it
 * patches in place and the grants it takes back or moves, each declared as an amendment of the step whose postcondition digests it (a grant taken back or
 * moved too: the chain re-measures that step's whole digest, its grants included). Its own postcondition digests what it adds and the earlier functions
 * it changes that no step's postcondition digests: 0040's lock of a request's own runs, 0085's key provision, the billing functions keyed by a run or an
 * owner that now ask the connection in their bodies but 0140's admission (0089's, 0092's, 0107's and the two 0123 restated), the functions
 * older than the chain whose grants it moves or takes back, the account functions keyed by a user id that ask now and are older than the chain (0040's to
 * 0095's), the overload of 0085's verification delivery it adds, and 0000's sequence allocator, which it makes a definer. It moves no billing function's grants, owner, definer flag or settings, which 0130's verifier
 * pins, so that verifier stays its own. It holds F2 to F5 whole; once applied, any later change is a step of its own.
 */
const NAME = "0171_security_review_hardening.sql";
const VERSION = "security-review-hardening-forward0171-v1";
const MANIFEST_PATH = "lineage/security-review-hardening-forward0171.json";
const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";
const PREVIOUS = "0170_outbound_mail_limit.sql";
const TABLES: readonly string[] = [
  // F4a: the forget scopes, one row while a definer's deletes run under a guard.
  "identity.private_forget_scope",
  // F5: the clarify charge's reservations, one row from before a paid call until its charge takes it, or, once an hour old, a later reservation or the
  // API's hourly sweep.
  "identity.ask_clarify_reservation",
  // F2: a dig's own row, written by the statement that creates its run, which names no parent.
  "identity.dig_run"
];
const FUNCTIONS: readonly string[] = [
  "core.publication_is_current(uuid)",
  // F4a: open and close a scope (the definers), and ask whether it is open (the guards).
  "identity.open_forget_scope(text)", "identity.close_forget_scope(text)", "identity.forget_scope_open(text)",
  // F5: whether the owner a request-facing function is handed is the one the database sees for the connection, the reservation of a clarify
  // call's charge for its person, made before the call while the session is live (the charge's person row), and the API's sweep of the
  // reservations no charge took (the marker's alone).
  "identity.request_owner_matches(uuid)", "identity.reserve_ask_clarify_charge(uuid,uuid)", "identity.delete_ask_clarify_reservations_due(integer)",
  // F5: the Report button's limits as the site holds them, the CURRENT release's sealed abuseLimits row, which 0151's opening counts against too.
  "identity.public_flag_site_limits()",
  // F5: a verification mail's delivery, recorded only for the token that mail carried (an overload of 0085's, which the API calls in its place).
  "identity.record_verification_delivery_with_audit(uuid,text,timestamptz,boolean,text,jsonb)",
  // F2: whether a debate is a dig (the run's creation for a re-admission, the key provision, the review ask and the Free reader, claim and notice
  // ask it), and the API's owner-scoped question.
  "identity.run_is_dig(uuid)", "identity.read_run_is_dig(uuid,uuid)",
  // F5: 0040's lock of a request's own live runs, which asks of an owner it is handed. Its body is older than the chain, so no step's postcondition
  // digested it; this one does, so a later step that restates it is an amendment of this one.
  "core.lock_owned_live_runs(uuid[],uuid,text)",
  // F5: 0040's evaluator call check, whose grant it moves to the marker (the evaluator worker keeps its own), and 0048's writer of a provider's
  // probe, whose grant it moves to the marker for the API's discovery site (X37). Older than the chain, so no step's postcondition digested
  // them; this one does.
  "evaluator.provider_call_request_is_authorized(uuid,text,text,text)", "core.record_provider_probe(uuid,text,text,text,text,text,timestamptz)",
  // F2: 0085's key provision, which refuses a dig. Its two earlier bodies (0085's and 0099's patch in place) are older than the chain, so no step's
  // postcondition digested it; this one does, as 0150's digests 0039's core.run_is_published, so a later step that restates it is an amendment of this one.
  "serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)",
  // F5: the grants it moves to the marker of functions older than the chain, which no step's postcondition digests, so this one does: 0088's
  // staff alert outbox (the claim's key mapping, the settlement, the queue's status; its claim is 0112's, below) and 0090's invitee channel reader,
  // 0100's consumer security notice loop (its claim, acknowledgement and failure; its read is 0116's, below), and the retention purges of 0046's
  // sign-in risk signals and 0080's legal acceptance records.
  "staff.read_alert_key_mapping(uuid,uuid)", "staff.settle_alert_delivery(uuid,uuid,text,text)", "staff.read_alert_delivery_status()",
  "staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)",
  "identity.claim_consumer_security_notices(integer)", "identity.ack_consumer_security_notice(uuid,uuid)", "identity.fail_consumer_security_notice(uuid,uuid,text)",
  "identity.purge_expired_authentication_risk_signals(integer)", "legal.purge_expired_acceptance(timestamptz)",
  // F5: and the staff ceremonies and changes moved to the marker for the API's staff repository's site (X14), older than the chain: 0085's grant and
  // acceptance, 0086's owned ceremony (its challenge read, failure, registration and assertion; its start and the capability check are 0142's, below),
  // the staff key reader and 0088's user mapping.
  'staff."grant"(jsonb,uuid,jsonb,uuid,text[],uuid,jsonb,jsonb)', "staff.accept(uuid,uuid,uuid,uuid,jsonb,jsonb)",
  "staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb)", "staff.fail_owned_webauthn(uuid,uuid,uuid)",
  "staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)",
  "staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text)",
  "identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text)", "staff.read_alert_user_mapping(uuid)",
  // F5: and the grants it takes back of functions older than the chain: 0046's reader of a recovery's risk signals and 0085's first staff ceremonies,
  // from every role, and 0085's hold question, from debateai_runtime alone.
  "identity.read_authentication_risk_signals_for_recovery(uuid)", "staff.begin_invitation_challenge(uuid,uuid,text,text,text)",
  "staff.begin_owner_possession_challenge(uuid,uuid,uuid,text,text,text,text)", "staff.begin_registration_challenge(uuid,uuid,text,text)",
  "staff.complete_invitation_proof(uuid,uuid,uuid,text,bigint,text,text)", "staff.complete_owner_possession(uuid,uuid,uuid,text,bigint,text,text)",
  "identity.read_account_security_hold(uuid)",
  // F5: the billing functions keyed by a run or an owner that ask the connection in their bodies now, whose grants, owners, definer flag and settings
  // stay as 0130's verifier pins them. No step's postcondition digested them (0089's, 0092's and 0107's are older than the chain; 0123 restated its
  // run state and person's grant but digests neither), so this one does; 0140's admission is 0140's (AMENDS below). 0089's list of the owners billing
  // stops, 0092's grant of a run and pin, 0107's settlement of an admitted call, and 0123's run state and person's grant. 0089's and 0091's erasure
  // and age questions and 0092's funding basis, refusals, ask no owner, and this step leaves them as they were.
  "billing.pending_erasure_owner_refs(uuid,integer)", "billing.read_internal_allowance_for_run(uuid,timestamptz)",
  "billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)",
  "billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)", "billing.read_internal_run_state(uuid)",
  "billing.read_internal_allowance(uuid,timestamptz)",
  // F5: 0000's sequence allocator, a definer of the counter's owner now, so no login that holds debateai_runtime writes the counter itself. Older than
  // the chain, so no step's postcondition digested it; this one does.
  "ledger.allocate_sequence()",
  // F5: the account functions keyed by a user id that ask the connection in their bodies now, older than the chain, so no step's postcondition
  // digested them and this one does: 0040's two session revocations, 0077's age check, its confirmation and its record at sign-up, 0078's consent
  // and its record, 0079's email settings and change resend, 0085's publication event refs and key provision abandonment, and 0095's sign-up region
  // (the record at sign-up and the region write only in the sign-up's own transaction). 0115's export status and download and 0125's Italy approval
  // are theirs (AMENDS below).
  "identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb)", "identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb)",
  "identity.read_age_check_outcome(uuid)", "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)",
  "identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)",
  "identity.read_sensitive_data_consent(uuid)", "identity.record_sensitive_data_consent(uuid,uuid,text,text,timestamptz)",
  "identity.read_email_settings(uuid,uuid)", "identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb)",
  "identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)", "serve.abandon_publication_key_provision(uuid,uuid)",
  "identity.record_registration_region(uuid,text,text)",
  // F5: and the grants it takes back or moves of functions older than the chain: 0085's verification delivery, which named no token (from
  // debateai_runtime), and 0098's passkey credential reader and sign-in completion and 0100's recovery proof reader, which the API reaches on its
  // system login (X36). 0100's proof and 0040's code use are 0112's (AMENDS below).
  "identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb)",
  "identity.read_consumer_passkey_credential(text,text,text)", "identity.complete_consumer_passkey_login(jsonb,jsonb)",
  "identity.read_consumer_recovery_proof(text,integer)"
];
/**
 * One entry a step (the chain records one amendment per amended step and amending step), its functions sorted. F4a: each guard of 0132 to 0147 asks its
 * scope instead of a setting, and each definer that set the setting (the nine forget definers, 0139's wipe, 0151's review purge) opens and closes the
 * scope instead. F5: 0131's ownership rule and each other definer the API's requests call ask the session's owner, the functions only the runner and the
 * API's system login call (the sweeps' steps, the runner's own steps of one debate, staff's notice and alert loops of 0128 to 0151, 0112's alert claim,
 * 0116's consumer notice read, 0126's purge and inheritance writer, and 0120's recorded facts of a debate) and 0142's capability check and owned
 * ceremony start, which the API's staff repository calls on its system login (X14), move from debateai_runtime to the cross-account marker, and those no
 * code calls (0140's and 0144's team spend sum among them) are taken back (a grant moved or taken back is a change of the step's digest too); the
 * three writers of the site's day that name no debate (0118's language check, 0128's question check, 0144's clarify charge) move to the marker too,
 * which the API reaches through its sites X30 to X32, and 0144's and 0149's spend totals of a person refuse another's connection; the run-keyed readers of 0132 to 0141 ask 0131's rule of the run's own owner, 0147's public copy asks of the material's owner, 0151's flag opening also
 * counts against the site's own limits and its settlement, which hides nothing for a report staff dismissed, moves to the marker, 0147's public line
 * asks of each row's run's owner, 0126's owner-taking readers ask too and 0127's review state refuses another's connection, as do 0123's list of a debate's unstarted re-admissions (its
 * owner's branch), 0126's result writer (inside its attempt match) and 0127's question whether a version was approved, of the run's latest owner
 * (0126's question whether a debate was removed, a refusal, asks none), while 0040's lock and its evaluator call check, moved, are no earlier step's (FUNCTIONS above); 0140's admission
 * of a funded debate's provider call refuses unless the run's owner is the connection's, and the other billing functions that ask now are no earlier
 * step's (FUNCTIONS above); 0112's recovery proof and saved code use move to the marker for the API's sign-in site (X36), 0115's export status and
 * download ask of the user id's own account, and 0125's Italy approval writes only in the sign-up's own transaction. F2: 0123's run
 * writer marks a dig as it creates its run, 0127's review ask refuses a dig, 0137's Free reader leaves digs out and its Free claim and notice refuse
 * them, and 0131's per-debate forget takes the erased debate's own dig row; 0085's key provision, which also refuses a dig, is no earlier step's
 * (FUNCTIONS above).
 */
const AMENDS = [
  // F5: the staff alert outbox's claim, which the dispatcher calls only from its timer, moves to the marker; 0112's release of a claim stays as it was.
  // And a recovery's proof and a saved code's use, which the API calls only on its system login (X36), move to the marker.
  { step: "0112_auth_db_batch.sql", field: "function_definition" as const, functions: [
    "identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)", "identity.prove_consumer_recovery(jsonb,jsonb)", "staff.claim_alert_delivery(integer)"] },
  // F5: the export's status and the record of its download ask of the user id's own account.
  { step: "0115_data_export.sql", field: "function_definition" as const, functions: [
    "identity.read_data_export_status(uuid)", "identity.record_data_export_download(uuid,uuid,jsonb)"] },
  // F5: the consumer security notice's read, with the rest of its loop, moves to the marker.
  { step: "0116_mail_locale.sql", field: "function_definition" as const, functions: ["identity.read_consumer_security_notice(uuid,uuid)"] },
  // F5: the language check's writer of the site's day moves to the marker, which the API reaches through its site (X30).
  { step: "0118_language_check_spend.sql", field: "function_definition" as const, functions: [
    "ledger.record_language_check_spend(uuid,text,date,bigint,bigint,bigint)"] },
  // F5: a debate's recorded facts, which only the runner's terminal activation reads, move to the marker.
  { step: "0120_reply_measures.sql", field: "function_definition" as const, functions: ["core.read_terminal_recorded_facts(uuid)"] },
  // F2: the one writer of every owner's run writes a dig's own row as it creates the run, from the run's document or the run it re-admits. F5: the
  // list of a debate's unstarted re-admissions asks, in its owner's branch, of the old run's latest owner.
  { step: "0123_side_by_side_releases.sql", field: "function_definition" as const, functions: [
    "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)", "core.list_unstarted_readmissions(uuid)"] },
  // F5: the sign-up's Italy approval writes only for an account the sign-up's own transaction created.
  { step: "0125_italy_specific_approval.sql", field: "function_definition" as const, functions: ["identity.record_signup_italy_approval(uuid,jsonb)"] },
  // F5: the synthesis check's removal notice and its question ask of the owner they are handed and the result writer asks of the run's latest owner
  // inside its attempt match; the purge of the notices past their retention and the inheritance writer, which the API's worker runs only from its
  // timer, move to the marker. The question whether a debate was removed, a refusal, asks no owner and is not this step's.
  { step: "0126_synthesis_check.sql", field: "function_definition" as const, functions: [
    "serve.purge_expired_synthesis_check_removal_notices()", "serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid)",
    "serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean)",
    "serve.synthesis_check_removal_notice_exists(uuid)", "serve.take_synthesis_check_removal_notice(uuid)"] },
  // F5: the publication review's state refuses a connection that is not the owner's, and the question whether a version was approved asks of the run's latest
  // owner. F2: the owner's ask for a review refuses a dig.
  { step: "0127_publication_review.sql", field: "function_definition" as const, functions: [
    "serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer)", "serve.publication_review_approved(uuid,uuid,integer)",
    "serve.read_publication_review_state(uuid,uuid,uuid)"] },
  // F5: the two keepers of a threat report, which no product code calls, are taken back from debateai_runtime; the alert loop (the holder's account,
  // the claim, the completion) and the erasure of the reports due, which the API runs only from its timers, move to the marker, and so does the
  // question check's writer of the site's day, which the API reaches through its site (X31).
  { step: "0128_threat_reports.sql", field: "function_definition" as const, functions: [
    "ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)", "staff.claim_threat_report_alerts(integer)", "staff.complete_threat_report_alert(uuid,uuid,boolean)", "staff.erase_due_threat_reports()",
    "staff.keep_threat_report(text,uuid)", "staff.keep_threat_report_with_email(text,uuid,text)", "staff.threat_report_recipient_user(uuid)"] },
  // F5: 0131's ownership rule asks the session's owner, and the reading level's reader and writer. F2: the per-debate forget takes the dig's own row.
  { step: "0131_v4_account_memory.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_page_memory(uuid)", "identity.page_memory_run_owned(uuid,uuid)", "identity.read_page_reading_level(uuid)",
    "identity.save_page_reading_level(uuid,text)"] },
  // F4a: the web evidence's guard and forget definer. F5: the researched mark and the evidence's reader ask; the page texts' reader, the researched
  // settlement and the web step's writers move.
  { step: "0132_web_evidence.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_web_evidence(uuid)", "identity.guard_web_evidence_record()", "identity.read_web_evidence(uuid)",
    "identity.read_web_page_texts(uuid,uuid[])", "identity.record_web_extract(uuid,uuid,uuid,text,smallint[],jsonb,bytea)",
    "identity.record_web_pack(uuid,uuid,text,text[],jsonb,bytea)",
    "identity.record_web_page(uuid,uuid,uuid,smallint,text,jsonb,bytea,integer,bytea,jsonb,bytea)", "identity.record_web_picks(uuid,text,uuid[])",
    "identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)", "identity.record_web_researched(uuid,uuid,uuid)",
    "identity.record_web_search(uuid,uuid,text,text,text,text,text,text,text,bigint,smallint,jsonb,bytea)",
    "identity.settle_web_researched(uuid,uuid,text)"] },
  // F4a: the investigations' guard and forget definer. F5: the investigation of a run asks of its member's owner; what no code calls is taken back,
  // the closing's report mark among them.
  { step: "0133_investigations.sql", field: "function_definition" as const, functions: [
    "identity.close_investigation(uuid,uuid)", "identity.forget_erased_debate_investigation(uuid)", "identity.guard_investigation_record()",
    "identity.join_investigation(uuid,uuid,uuid,text[],text)", "identity.read_investigation(uuid,uuid)",
    "identity.read_investigation_of_run(uuid)", "identity.read_reserve(uuid)",
    "identity.record_investigation_report(uuid,integer,uuid)", "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)",
    "identity.wipe_inactive_web_page_text(integer)"] },
  // F4a: the dig model's guard and forget definer. F5: the pause's reader and Continue, the rewrites' and the web plan's readers of a run ask; the
  // runner's level read, rewrite turns, rewrites, web plan and pause move; what no code calls is taken back.
  { step: "0134_dig_model_and_month_pause.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_dig_model(uuid)", "identity.guard_dig_model_record()", "identity.read_dig_level_of_run(uuid)",
    "identity.read_investigation_dig_levels(uuid,uuid)", "identity.read_path_rewrite_turn(uuid)", "identity.read_path_rewrites(uuid,uuid)",
    "identity.read_path_rewrites_of_run(uuid)", "identity.read_paused_runs(uuid)", "identity.read_run_pause(uuid,uuid)",
    "identity.read_run_pause_of_run(uuid)", "identity.read_web_plan(uuid)",
    "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)", "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)",
    "identity.resume_paused_run(uuid,uuid)", "identity.take_path_rewrite_turn(uuid,uuid,text)"] },
  // F4a: the picks' guard and forget definer. F5: the picks' writer and their reader of a run ask; the runner's list of rewrites owed and the
  // rewrite's material move.
  { step: "0135_dig_picks.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_dig_picks(uuid)", "identity.guard_dig_pick_record()", "identity.read_dig_picks_of_run(uuid)",
    "identity.read_unwritten_path_rewrites(timestamptz,integer)",
    "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)", "identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)"] },
  // F4a: the reports' guard. F5: the reports' reader of a run asks; the runner's list of closings to report, the closing's wait, its report version
  // and its spend window move.
  { step: "0136_investigation_reports.sql", field: "function_definition" as const, functions: [
    "identity.guard_investigation_report_record()", "identity.read_closing_since_of_root(uuid)", "identity.read_investigation_reports_of_run(uuid)",
    "identity.read_investigation_waiting_of_run(uuid)", "identity.read_unreported_closings(integer)",
    "identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)"] },
  // F3: the legacy public join's grant to the API's billing role is taken back. F4a: the public debates' guard and forget definer. F5: the picks
  // and the own contributions ask; the Free debates' reader, prepare, publish and refusal, the dig's settlement, the page's copy, the charge and the
  // runner's read of a public dig's contribution move;
  // the window reader is taken back. F2: the Free debates' reader leaves digs out, the Free claim answers that a dig waits for nothing, and the Free
  // notice records none for a dig.
  { step: "0137_public_debates.sql", field: "function_definition" as const, functions: [
    "core.prepare_free_publication(uuid,uuid)", "core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)", "identity.claim_free_public_ask(uuid)",
    "identity.forget_erased_debate_public(uuid)", "identity.guard_public_debate_record()",
    "identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)", "identity.read_free_debates_to_publish(integer)",
    "identity.read_own_public_contributions(uuid,uuid)", "identity.read_public_contribution_of_run(uuid)",
    "identity.read_public_report_spent(uuid,timestamptz,timestamptz)", "identity.record_free_public_ask(uuid,uuid)",
    "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)",
    "identity.record_public_dig_picks(uuid,uuid,jsonb)", "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)",
    "identity.refuse_free_publication(uuid)", "identity.settle_public_contribution(uuid,text,uuid)"] },
  // F4a: the tree updates' guard and forget definer. F5: the purpose lines and the three readers of a run ask; the main answer's writer and the
  // runner's climb turns, records and next climb move; what no code calls is taken back.
  { step: "0138_tree_updates.sql", field: "function_definition" as const, functions: [
    "identity.close_public_investigation(uuid,uuid)", "identity.forget_erased_debate_tree_updates(uuid)", "identity.guard_tree_update_record()",
    "identity.read_main_answer_updates(uuid,uuid)", "identity.read_main_answer_updates_of_run(uuid)", "identity.read_path_climb_next(uuid)",
    "identity.read_path_line(uuid,uuid)", "identity.read_path_line_of_run(uuid)", "identity.read_path_update_turn(uuid)",
    "identity.read_run_purpose_lines(uuid,uuid)", "identity.read_run_purpose_lines_of_run(uuid)",
    "identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
    "identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)", "identity.reopen_public_investigation(uuid,integer)",
    "identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)"] },
  // F4a: the passages' guard, wipe and forget definer. F5: the shown quotes' reader of a run asks; the replies' reader and writer, the shown
  // quotes' writer, the wipe and the list of debates holding passages move.
  { step: "0139_passage_retention.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_passages(uuid)", "identity.guard_passage_retention_record()", "identity.read_debates_holding_passages(integer)",
    "identity.read_web_reply_texts(uuid,uuid[])", "identity.read_web_shown_quotes(uuid)", "identity.record_web_reply_text(uuid,uuid,jsonb,bytea)",
    "identity.record_web_shown_quote(uuid,uuid,jsonb,bytea)", "identity.wipe_debate_passages(uuid,text)"] },
  // F4a: the path suggestions' guard and forget definer. F5: their reader of a run asks; the runner's writer of suggestions moves.
  { step: "0141_path_suggestions.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_path_suggestions(uuid)", "identity.guard_path_suggestions_record()", "identity.read_path_suggestions_of_run(uuid)",
    "identity.record_path_suggestions(uuid,uuid,uuid,text,jsonb,bytea)"] },
  // F5: the admission of a funded debate's provider call refuses (REQUEST_OWNER_MISMATCH) unless the run's owner is the connection's, its grant,
  // owner, definer flag and settings as 0130's verifier pins them; the team spend sum, which only staff's own month reader asks, as its owner, is
  // taken back.
  { step: "0140_internal_spend_kinds.sql", field: "function_definition" as const, functions: [
    "billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)", "staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  // F5: the team limit's notice loop (its claim, completion and recipient), which the API drains only from its timer, moves; so do the staff
  // capability check and the owned key ceremony's start, which 0142 restated, for the API's staff repository's site (X14).
  { step: "0142_team_limit.sql", field: "function_definition" as const, functions: [
    "staff.authorize_action(jsonb,text)", "staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)",
    "staff.claim_team_limit_notices(integer)", "staff.complete_team_limit_notice(uuid,uuid,boolean)", "staff.team_limit_notice_user(uuid,uuid)"] },
  // F5: the hand-over's Continue asks; the question whether work is parked and the idle page texts' wipe move.
  { step: "0143_run_handover.sql", field: "function_definition" as const, functions: [
    "identity.continue_paused_run_in_release(uuid,uuid,text,bigint)", "identity.run_work_is_parked(uuid,text,timestamptz)",
    "identity.wipe_inactive_web_page_text_of_idle_debates(integer)"] },
  // F5: 0144's charge writer names in its person's row the account the call was reserved for, or with no reservation the owner it is handed (it asks
  // nothing of the connection), and keeps the grant it is handed only when it is that person's own and was running when the call was reserved; the
  // ledger row stays, and the writer moves to the marker, which the API reaches through its site (X32). The person's spend total refuses another's
  // connection. The team spend sum it restated is taken back.
  { step: "0144_ask_clarify_charge.sql", field: "function_definition" as const, functions: [
    "identity.read_ask_clarify_spent(uuid,timestamptz,timestamptz)", "identity.record_ask_clarify_charge(uuid,uuid,uuid,uuid,text,date,bigint,bigint,bigint)", "staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  // F5: the runner's list of researched marks to settle moves.
  { step: "0145_web_researched_unsettled.sql", field: "function_definition" as const, functions: ["identity.read_unsettled_web_researched(integer)"] },
  // F5: the allowances' notice loop, through the same timer, moves.
  { step: "0146_team_allowances.sql", field: "function_definition" as const, functions: [
    "staff.allowance_notice_user(uuid,uuid)", "staff.claim_allowance_notices(integer)", "staff.complete_allowance_notice(uuid,uuid,boolean)"] },
  // F4a: the public tree's guard and forget definer. F5: the public report and the public copy ask, and the public line keeps a request's own runs'
  // rows; the runner's and the page sweep's readers, listers, marks and page writers move, and the runner's public dig input, turns, copies, report
  // and the report's spend window.
  { step: "0147_public_tree.sql", field: "function_definition" as const, functions: [
    "identity.forget_erased_debate_public_tree(uuid)", "identity.guard_public_tree_record()", "identity.mark_public_climb_done(uuid)",
    "identity.open_public_report(uuid,uuid,uuid,boolean)", "identity.read_free_debate_owner(uuid)", "identity.read_public_answer_updates(uuid)",
    "identity.read_public_checks_passed(integer)", "identity.read_public_climb_next(uuid)", "identity.read_public_climbs_owed(integer)",
    "identity.read_public_dig_input(uuid)", "identity.read_public_digs_unsettled(timestamptz,integer)", "identity.read_public_material(uuid)",
    "identity.read_public_page_owed(integer)", "identity.read_public_path_line(uuid)", "identity.read_public_report_charged_until(uuid)",
    "identity.read_public_reports_owed(integer)",
    "identity.read_public_reports_unwritten(integer)",
    "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)",
    "identity.record_public_check_passed(uuid,uuid)", "identity.record_public_debate_report(uuid,integer,uuid,jsonb)",
    "identity.record_public_dig_input(uuid,text,jsonb,bytea)", "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)",
    "identity.record_public_page_skip(uuid,uuid,text,text)",
    "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
    "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)",
    "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)"] },
  // F5: the public report's charge and the page's copy, which 0149 redefined, and the page sweep's report check move to the marker; a person's
  // public report total by funding refuses another's connection.
  { step: "0149_public_report_team_month.sql", field: "function_definition" as const, functions: [
    "identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean)", "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)", "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)",
    "identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer)"] },
  // F4b: the reviewer's door reads only a link that is still its debate's current publication. F5: the review's notice loop moves.
  { step: "0150_public_review.sql", field: "function_definition" as const, functions: [
    "staff.claim_public_review_notices(integer)", "staff.complete_public_review_notice(uuid,uuid,boolean)", "staff.public_review_notice_user(uuid,uuid)",
    "staff.read_public_review(jsonb,text,uuid)"] },
  // F4a: the review purge's deletion of the page's older copies. F5: the flag's opening asks and counts against the site's own limits too; its
  // settlement, which hides nothing for a report staff dismissed, the purge's three and the flag notices' loop move to the marker.
  { step: "0151_public_flag.sql", field: "function_definition" as const, functions: [
    "identity.delete_public_flag_words_due()", "identity.open_public_flag(uuid,uuid,uuid,jsonb,integer,integer,integer)",
    "identity.public_review_purge(uuid,text,uuid,text,integer,jsonb,text)", "identity.read_public_review_purge_due(integer)",
    "identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)", "staff.claim_public_flag_notices(integer)",
    "staff.complete_public_flag_notice(uuid,uuid,boolean)", "staff.public_flag_notice_user(uuid,uuid)"] },
  // F5: the runner's mark of a settled dig tree and the estimate's question whether a dig is settled move.
  { step: "0153_dig_tree_settled.sql", field: "function_definition" as const, functions: [
    "identity.dig_is_settled(uuid)", "identity.mark_dig_tree_settled(uuid)"] },
  // F5, at the second merge of the V4 line: the team's spent reader's grant is taken back from debateai_runtime, and 0158, 0165 and 0168, which restate it, digest its grants.
  { step: "0158_pre_start_charge.sql", field: "function_definition" as const, functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  // F2: 0163 restated the run's creation with the carry-on's commit, and digests it.
  { step: "0163_carry_on_session_free_digs.sql", field: "function_definition" as const, functions: ["core.create_encrypted_run(jsonb,uuid,uuid,jsonb)"] },
  { step: "0165_pre_start_release.sql", field: "function_definition" as const, functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] },
  { step: "0168_set_aside_continue.sql", field: "function_definition" as const, functions: ["staff.read_team_internal_spent(timestamptz,timestamptz)"] }
];
const fail = (detail: string): never => { throw Error(`MIGRATION_FORWARD0171_${detail}`); };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const digest = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

/** The tables (owner, ACL, columns, constraints, indexes, triggers) and the functions (owner, definer, body, ACL). */
async function postconditionEvidence(client: PoolClient): Promise<string> {
  const tables = (await client.query(`
    SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
      (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
      (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
      (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers
    FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) ORDER BY relation`, [TABLES])).rows;
  if (tables.length !== TABLES.length) return fail("POSTCONDITION_OBJECTS");
  const functions = (await client.query(`
    SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
      (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
    FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (functions.length !== FUNCTIONS.length) return fail("POSTCONDITION_OBJECTS");
  return sha(JSON.stringify({ tables, functions }));
}

export async function loadForward0171(anchor: ForwardStepAnchor): Promise<ForwardStepPlan> {
  const directory = new URL("../../../migrations/", import.meta.url);
  const bytes = await readFile(new URL(MANIFEST_PATH, directory));
  const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (!exactKeys(raw, ["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"])
    || raw.version !== VERSION || raw.baseRecipeSha256 !== anchor.baseRecipeSha256
    || !exactKeys(raw.previous, ["name", "manifestSha256", "verifierSha256"])
    || raw.previous.name !== PREVIOUS || anchor.previousName !== PREVIOUS
    || raw.previous.manifestSha256 !== anchor.previousManifestSha256
    || raw.previous.verifierSha256 !== anchor.previousVerifierSha256
    || !exactKeys(raw.migration, ["name", "sha256"]) || raw.migration.name !== NAME
    || !digest(raw.migration.sha256)
    || !exactKeys(raw.verifier, ["path", "sha256"]) || raw.verifier.path !== VERIFIER_PATH
    || !digest(raw.verifier.sha256) || JSON.stringify(raw.amendsPostconditionsOf) !== JSON.stringify(AMENDS)) return fail("MANIFEST");
  const sqlBytes = await readFile(new URL(NAME, directory));
  if (sha(sqlBytes) !== raw.migration.sha256) return fail("SOURCE_DIGEST");
  const verifierBytes = await readFile(new URL(VERIFIER_PATH, directory));
  if (sha(verifierBytes) !== raw.verifier.sha256) return fail("VERIFIER_DIGEST");
  return Object.freeze({
    name: NAME, version: VERSION, manifestSha256: sha(bytes), sourceSha256: raw.migration.sha256,
    sql: sqlBytes.toString("utf8"), previousName: PREVIOUS,
    previousManifestSha256: anchor.previousManifestSha256,
    previousVerifierSha256: anchor.previousVerifierSha256,
    verifierPath: VERIFIER_PATH, verifierSha256: raw.verifier.sha256,
    verifierSql: verifierBytes.toString("utf8"), postconditionEvidence, amendsPostconditionsOf: AMENDS
  });
}
