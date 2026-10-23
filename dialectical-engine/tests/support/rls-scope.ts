/**
 * The in-scope set of mission row-level-security S01 and the catalog facts its tests compare against, as measured
 * literals (PLAN S01 §0.3 "Test support", step S1.1). Each list is copied from a measured probe, never computed by the
 * code under test: the rule (`.hermes/reports/row-level-security/probes/REQ-RLS/rule.sql`, SPEC-v4 R1), its 113 members
 * at base (`probes/REQ-RLS/rule-members.tsv`, R2), the eighteen relations whose RLS flag 0124 amends in an earlier
 * postcondition (DECISIONS D38 and F-C1-1, R28), the `rls_all_accounts` TO list (D29) and the predicate allow-list (D34,
 * `probes/ARCH-S01/allow-list.json`, R15). Test support only: nothing under packages/ or apps/ imports it.
 */

/** `probes/REQ-RLS/rule.sql`, verbatim (R1): run as a superuser, it lists the in-scope relations. */
export const RLS_SCOPE_RULE_SQL = String.raw`-- REQ-RLS in-scope rule (SPEC S01 R-INV-1), mission row-level-security, 2026-10-23.
-- Evaluate as a superuser on a migrated database. :api_roles is every role the request-serving API logins
-- (principals api-runtime and api-authorization, P3-01-production-database-principals.json) are DIRECT members of;
-- at base ca61cbe00 that is {debateai_billing_runtime, debateai_authorization_runtime}. has_*_privilege follows
-- inherited membership, so debateai_runtime's grants count through both.
-- IN SCOPE = every user relation (table, partitioned table, view, materialized view, foreign table) that one of those
-- roles can SELECT (table-level or any column, with USAGE on its schema), MINUS the named exclusions below, each of
-- which holds no row that belongs to an account (reason per row in SPEC S01 §3).
WITH api(role) AS (VALUES ('debateai_billing_runtime'), ('debateai_authorization_runtime')),
excluded(relation) AS (VALUES
  ('billing.tool_order'), ('ledger.model_spend_reservation'), ('ledger.sequence_allocator'),
  ('register.register_row'), ('register.register_version'), ('register.required_row'), ('register.required_row_version'),
  ('scorecard.model_identity'), ('scorecard.scorecard_cell'))
SELECT n.nspname || '.' || c.relname AS relation, c.relkind::text AS kind, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'
  AND EXISTS (SELECT 1 FROM api WHERE has_schema_privilege(api.role, n.oid, 'USAGE')
                                  AND has_any_column_privilege(api.role, c.oid, 'SELECT'))
  AND n.nspname || '.' || c.relname NOT IN (SELECT relation FROM excluded)
ORDER BY 1;
`;

/** The 113 members of the rule at base, in `rule-members.tsv` order: 110 tables (`r`) and 3 views (`v`) (R2). */
export const RLS_IN_SCOPE: readonly Readonly<{ relation: string; kind: "r" | "v" }>[] = Object.freeze([
  { relation: "billing.cancel_token", kind: "r" },
  { relation: "billing.cancel_token_use", kind: "r" },
  { relation: "billing.card_token", kind: "r" },
  { relation: "billing.card_token_revocation", kind: "r" },
  { relation: "billing.charge", kind: "r" },
  { relation: "billing.charge_event", kind: "r" },
  { relation: "billing.customer", kind: "r" },
  { relation: "billing.customer_profile_event", kind: "r" },
  { relation: "billing.customer_xmoney", kind: "r" },
  { relation: "billing.entitlement_event", kind: "r" },
  { relation: "billing.hosted_payment", kind: "r" },
  { relation: "billing.invoice", kind: "r" },
  { relation: "billing.invoice_intent", kind: "r" },
  { relation: "billing.invoice_status_event", kind: "r" },
  { relation: "billing.location_evidence", kind: "r" },
  { relation: "billing.notice_quarantine", kind: "r" },
  { relation: "billing.outbox", kind: "r" },
  { relation: "billing.payment_notice", kind: "r" },
  { relation: "billing.payment_notice_outcome", kind: "r" },
  { relation: "billing.payment_notice_raw", kind: "r" },
  { relation: "billing.person_windows_v", kind: "v" },
  { relation: "billing.quote", kind: "r" },
  { relation: "billing.quote_use", kind: "r" },
  { relation: "billing.run_charge_scope", kind: "r" },
  { relation: "billing.status_read", kind: "r" },
  { relation: "billing.subscription_event", kind: "r" },
  { relation: "billing.subscription_latest_v", kind: "v" },
  { relation: "billing.withdrawal_owner_settlement", kind: "r" },
  { relation: "billing.xmoney_notice", kind: "r" },
  { relation: "billing.xmoney_notice_outcome", kind: "r" },
  { relation: "core.critique_packet", kind: "r" },
  { relation: "core.edge", kind: "r" },
  { relation: "core.independence_receipt", kind: "r" },
  { relation: "core.map_answer_check", kind: "r" },
  { relation: "core.map_choice", kind: "r" },
  { relation: "core.map_item", kind: "r" },
  { relation: "core.map_item_rests_on", kind: "r" },
  { relation: "core.map_position", kind: "r" },
  { relation: "core.map_position_repoint", kind: "r" },
  { relation: "core.node", kind: "r" },
  { relation: "core.objection_record", kind: "r" },
  { relation: "core.question_liveness_event", kind: "r" },
  { relation: "core.reversal_point", kind: "r" },
  { relation: "core.review_clock", kind: "r" },
  { relation: "core.revision_trigger", kind: "r" },
  { relation: "core.run", kind: "r" },
  { relation: "core.run_cost_substitution", kind: "r" },
  { relation: "core.run_ownership_event", kind: "r" },
  { relation: "core.run_progress_event", kind: "r" },
  { relation: "core.run_role_assignment", kind: "r" },
  { relation: "core.run_role_rotation", kind: "r" },
  { relation: "core.run_row_activation", kind: "r" },
  { relation: "core.run_row_activation_event", kind: "r" },
  { relation: "core.run_supersession", kind: "r" },
  { relation: "core.run_visibility_event", kind: "r" },
  { relation: "core.run_wait", kind: "r" },
  { relation: "core.run_wait_reason", kind: "r" },
  { relation: "core.run_wait_start", kind: "r" },
  { relation: "core.run_waiting_v", kind: "v" },
  { relation: "core.staleness_state", kind: "r" },
  { relation: "core.stranger_restatement", kind: "r" },
  { relation: "core.symmetry_diff", kind: "r" },
  { relation: "core.value_hinge", kind: "r" },
  { relation: "core.verification_trigger_basis", kind: "r" },
  { relation: "core.work_item", kind: "r" },
  { relation: "identity.audit_event", kind: "r" },
  { relation: "identity.channel_binding", kind: "r" },
  { relation: "identity.login_challenge", kind: "r" },
  { relation: "identity.mfa_factor", kind: "r" },
  { relation: "identity.recovery_code", kind: "r" },
  { relation: "identity.session", kind: "r" },
  { relation: "identity.user", kind: "r" },
  { relation: "ledger.call_prompt", kind: "r" },
  { relation: "ledger.decision_record", kind: "r" },
  { relation: "ledger.ledger_entry", kind: "r" },
  { relation: "ledger.model_spend", kind: "r" },
  { relation: "ledger.model_spend_hold", kind: "r" },
  { relation: "ledger.model_spend_waiver", kind: "r" },
  { relation: "ledger.node_review", kind: "r" },
  { relation: "ledger.node_strength_record", kind: "r" },
  { relation: "ledger.overlay_run", kind: "r" },
  { relation: "ledger.point_investigation", kind: "r" },
  { relation: "ledger.propagation_run", kind: "r" },
  { relation: "ledger.raw_artifact", kind: "r" },
  { relation: "ledger.reduced_judgement", kind: "r" },
  { relation: "ledger.sensitivity_record", kind: "r" },
  { relation: "ledger.verdict_vote", kind: "r" },
  { relation: "legal.acceptance", kind: "r" },
  { relation: "memory.alias_revocation", kind: "r" },
  { relation: "memory.alias_row", kind: "r" },
  { relation: "memory.candidate_record", kind: "r" },
  { relation: "memory.memory_link", kind: "r" },
  { relation: "memory.memory_link_event", kind: "r" },
  { relation: "memory.pull_record", kind: "r" },
  { relation: "memory.question_key", kind: "r" },
  { relation: "scorecard.answer_outcome", kind: "r" },
  { relation: "scorecard.routing_decision", kind: "r" },
  { relation: "scorecard.session_assignment", kind: "r" },
  { relation: "serve.abstention", kind: "r" },
  { relation: "serve.answer", kind: "r" },
  { relation: "serve.answer_story", kind: "r" },
  { relation: "serve.composed_text", kind: "r" },
  { relation: "serve.condition_mark", kind: "r" },
  { relation: "serve.condition_mark_node", kind: "r" },
  { relation: "serve.conformance_record", kind: "r" },
  { relation: "serve.fact_bundle", kind: "r" },
  { relation: "serve.publication_snapshot", kind: "r" },
  { relation: "serve.segment_suppression", kind: "r" },
  { relation: "serve.serve_disclosure", kind: "r" },
  { relation: "serve.served_number", kind: "r" },
  { relation: "serve.served_number_event", kind: "r" },
  { relation: "serve.shadow_suppression", kind: "r" },
  { relation: "serve.synthesis_round", kind: "r" }
]);

/** The eighteen tables whose `relrowsecurity` an earlier step's postcondition digest pins, with that step (D38, F-C1-1, R28). */
export const RLS_AMENDED: readonly Readonly<{ relation: string; step: string }>[] = Object.freeze([
  { relation: "billing.card_token", step: "0111_billing_netopia.sql" },
  { relation: "billing.card_token_revocation", step: "0111_billing_netopia.sql" },
  { relation: "billing.hosted_payment", step: "0111_billing_netopia.sql" },
  { relation: "billing.notice_quarantine", step: "0111_billing_netopia.sql" },
  { relation: "billing.payment_notice", step: "0111_billing_netopia.sql" },
  { relation: "billing.payment_notice_outcome", step: "0111_billing_netopia.sql" },
  { relation: "billing.payment_notice_raw", step: "0111_billing_netopia.sql" },
  { relation: "billing.status_read", step: "0111_billing_netopia.sql" },
  { relation: "core.map_choice", step: "0117_debate_shape_map.sql" },
  { relation: "core.map_item", step: "0117_debate_shape_map.sql" },
  { relation: "core.map_position", step: "0117_debate_shape_map.sql" },
  { relation: "core.map_position_repoint", step: "0119_reclaim_resume.sql" },
  { relation: "ledger.point_investigation", step: "0121_engine_verdict.sql" },
  { relation: "ledger.verdict_vote", step: "0121_engine_verdict.sql" },
  { relation: "core.map_answer_check", step: "0122_engine_map_check.sql" },
  { relation: "core.map_item_rests_on", step: "0122_engine_map_check.sql" },
  { relation: "core.run_supersession", step: "0123_side_by_side_releases.sql" },
  { relation: "ledger.model_spend_waiver", step: "0123_side_by_side_releases.sql" }
]);

/** The roles of policy `rls_all_accounts`, in D29's order (binding TO list). */
export const RLS_ALL_ACCOUNTS_ROLES: readonly string[] = Object.freeze([
  "debateai_rls_all_accounts",
  "debateai_replay",
  "debateai_settlement_watch",
  "debateai_evaluator_worker",
  "debateai_staff_security_owner",
  "debateai_mfa_recovery_owner",
  "debateai_password_recovery_owner",
  "debateai_password_reset_owner",
  "debateai_obs_view_owner",
  "debateai_backup_email_owner",
  "debateai_release_owner"
]);

/** R15's predicate allow-list: the 39 texts of D34, JSON-decoded, as `pg_get_expr` prints them. */
export const RLS_ALLOW_LIST: readonly string[] = Object.freeze([
  "(EXISTS ( SELECT 1\n   FROM billing.cancel_token p\n  WHERE (p.token_sha256 = cancel_token_use.token_sha256)))",
  "(EXISTS ( SELECT 1\n   FROM billing.card_token p\n  WHERE (p.token_id = card_token_revocation.token_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE ((p.charge_id = charge_event.charge_id) AND (p.payment_environment = charge_event.payment_environment) AND (p.payment_provider = charge_event.payment_provider))))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = hosted_payment.charge_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = invoice_intent.charge_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = location_evidence.charge_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = notice_quarantine.order_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = payment_notice.order_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = quote_use.charge_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.charge p\n  WHERE (p.charge_id = status_read.charge_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.customer p\n  WHERE (p.customer_id = card_token.customer_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.customer p\n  WHERE (p.customer_id = customer_profile_event.customer_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.customer p\n  WHERE (p.customer_id = customer_xmoney.customer_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.invoice p\n  WHERE (p.invoice_id = invoice_status_event.invoice_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.invoice_intent p\n  WHERE ((p.charge_id = invoice.charge_id) AND (p.kind = invoice.kind) AND (p.issuer = invoice.issuer))))",
  "(EXISTS ( SELECT 1\n   FROM billing.payment_notice p\n  WHERE (p.notice_id = payment_notice_outcome.notice_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.payment_notice p\n  WHERE (p.notice_id = payment_notice_raw.notice_id)))",
  "(EXISTS ( SELECT 1\n   FROM billing.subscription_event p\n  WHERE (p.subscription_id = cancel_token.subscription_id)))",
  "(EXISTS ( SELECT 1\n   FROM core.node p\n  WHERE (p.node_id = condition_mark_node.node_id)))",
  "(EXISTS ( SELECT 1\n   FROM core.node p\n  WHERE (p.node_id = node_strength_record.node_id)))",
  "(EXISTS ( SELECT 1\n   FROM core.node p\n  WHERE (p.node_id = sensitivity_record.removed_node_id)))",
  "(EXISTS ( SELECT 1\n   FROM ledger.raw_artifact p\n  WHERE (p.raw_artifact_id = composed_text.raw_artifact_ref)))",
  "(EXISTS ( SELECT 1\n   FROM memory.alias_row p\n  WHERE (p.alias_row_id = alias_revocation.alias_row_id)))",
  "(EXISTS ( SELECT 1\n   FROM memory.memory_link p\n  WHERE (p.memory_link_id = memory_link_event.memory_link_id)))",
  "(EXISTS ( SELECT 1\n   FROM memory.memory_link p\n  WHERE (p.memory_link_id = pull_record.memory_link_id)))",
  "(EXISTS ( SELECT 1\n   FROM serve.answer p\n  WHERE ((p.answer_id = abstention.answer_id) AND (p.answer_version = abstention.answer_version))))",
  "(EXISTS ( SELECT 1\n   FROM serve.answer p\n  WHERE ((p.answer_id = condition_mark.answer_id) AND (p.answer_version = condition_mark.answer_version))))",
  "(EXISTS ( SELECT 1\n   FROM serve.answer p\n  WHERE ((p.answer_id = segment_suppression.answer_id) AND (p.answer_version = segment_suppression.answer_version))))",
  "(EXISTS ( SELECT 1\n   FROM serve.answer p\n  WHERE ((p.answer_id = shadow_suppression.answer_id) AND (p.answer_version = shadow_suppression.answer_version))))",
  "(EXISTS ( SELECT 1\n   FROM serve.composed_text p\n  WHERE (p.composed_text_id = conformance_record.composed_text_id)))",
  "(EXISTS ( SELECT 1\n   FROM serve.served_number p\n  WHERE (p.served_number_id = served_number_event.served_number_id)))",
  "(owner_ref = ( SELECT rls.context_owner_ref() AS context_owner_ref))",
  "(user_id = ( SELECT rls.context_user_id() AS context_user_id))",
  "false",
  "rls.owns_execution_ref(session_id)",
  "rls.owns_run(old_run_id)",
  "rls.owns_run(prior_run_id)",
  "rls.owns_run(run_id)",
  "rls.owns_run(source_run_id)"
]);
