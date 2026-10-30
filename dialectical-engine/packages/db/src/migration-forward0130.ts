import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan, PostconditionAmendment } from './migration-forward-chain.js';

/**
 * Row-level security (mission row-level-security S01, SPEC-v4 R1-R4, R12, R15-R17, R26-R30, R34; PLAN S1.4-S1.6;
 * ADR-0033) as the chain step after the support answer scope's 0129 (migrations/lineage/README.md). 0130 enables row
 * security (never forced) on the 115 in-scope tables with the two policies rls_account (TO debateai_runtime, the
 * per-account predicate of DECISIONS D32) and rls_all_accounts (TO the eleven cross-account roles of D29), makes the
 * three in-scope views apply the invoker's security and moves core.run_waiting_v's SELECT to debateai_billing_runtime
 * (D33), and adds the schema rls with its five SECURITY DEFINER context functions and the NOLOGIN NOINHERIT marker role
 * debateai_rls_all_accounts. Its postcondition (below) digests every row-security field of those tables (R29): an
 * unrecorded change refuses POSTCONDITION_DRIFT 0130 on every later migrate(). It turns on the flag that seven earlier
 * steps' postconditions pin for twenty-three tables, so it declares those amendments (D38, R28; 0111's eight NETOPIA tables
 * by orchestrator Ruling R-10, DECISIONS F-C1-1) and the chain records each amended step's digest re-measured after
 * this step; and because 0111's verifier also refuses row security on those eight tables, its verifier supersedes 0111's (lineage/verify-effective-capabilities-130.sql, R34) and its header is `drained`
 * without `keeps-verifier` (V-1). No supplemental verifier, so no replayVerifierSql.
 */
const NAME='0130_row_level_security.sql';
const VERSION='row-level-security-forward0130-v1';
const MANIFEST_PATH='lineage/row-level-security-forward0130.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-130.sql'; // R34: 0111's verifier with its row-security clause for the eight NETOPIA tables changed (README step 3)
const PREVIOUS='0129_support_answer_scope.sql';
/**
 * The 115 in-scope tables (SPEC-v4 R2, probes/REQ-RLS/rule-members.tsv), in DECISIONS D32's row order, then the five
 * serve.synthesis_check_* tables mission synthesis-flag's 0126 grants debateai_runtime SELECT on, which joined at the
 * merge onto that dev (2026-10-28).
 */
const TABLES=['billing.cancel_token','billing.cancel_token_use','billing.card_token','billing.card_token_revocation',
 'billing.charge','billing.charge_event','billing.customer','billing.customer_profile_event','billing.customer_xmoney',
 'billing.entitlement_event','billing.hosted_payment','billing.invoice','billing.invoice_intent',
 'billing.invoice_status_event','billing.location_evidence','billing.notice_quarantine','billing.outbox',
 'billing.payment_notice','billing.payment_notice_outcome','billing.payment_notice_raw','billing.quote',
 'billing.quote_use','billing.run_charge_scope','billing.status_read','billing.subscription_event',
 'billing.withdrawal_owner_settlement','billing.xmoney_notice','billing.xmoney_notice_outcome',
 'core.critique_packet','core.edge','core.independence_receipt','core.map_answer_check','core.map_choice',
 'core.map_item','core.map_item_rests_on','core.map_position','core.map_position_repoint','core.node',
 'core.objection_record','core.question_liveness_event','core.reversal_point','core.review_clock',
 'core.revision_trigger','core.run','core.run_cost_substitution','core.run_ownership_event','core.run_progress_event',
 'core.run_role_assignment','core.run_role_rotation','core.run_row_activation','core.run_row_activation_event',
 'core.run_supersession','core.run_visibility_event','core.run_wait','core.run_wait_reason','core.run_wait_start',
 'core.staleness_state','core.stranger_restatement','core.symmetry_diff','core.value_hinge',
 'core.verification_trigger_basis','core.work_item','identity.audit_event','identity.channel_binding',
 'identity.login_challenge','identity.mfa_factor','identity.recovery_code','identity.session','identity.user',
 'ledger.call_prompt','ledger.decision_record','ledger.ledger_entry','ledger.model_spend','ledger.model_spend_hold',
 'ledger.model_spend_waiver','ledger.node_review','ledger.node_strength_record','ledger.overlay_run',
 'ledger.point_investigation','ledger.propagation_run','ledger.raw_artifact','ledger.reduced_judgement',
 'ledger.sensitivity_record','ledger.verdict_vote','legal.acceptance','memory.alias_revocation','memory.alias_row',
 'memory.candidate_record','memory.memory_link','memory.memory_link_event','memory.pull_record','memory.question_key',
 'scorecard.answer_outcome','scorecard.routing_decision','scorecard.session_assignment','serve.abstention',
 'serve.answer','serve.answer_story','serve.composed_text','serve.condition_mark','serve.condition_mark_node',
 'serve.conformance_record','serve.fact_bundle','serve.publication_snapshot','serve.segment_suppression',
 'serve.serve_disclosure','serve.served_number','serve.served_number_event','serve.shadow_suppression',
 'serve.synthesis_round','serve.synthesis_check_attempt','serve.synthesis_check_inheritance',
 'serve.synthesis_check_removal_request','serve.synthesis_check_request','serve.synthesis_check_result'] as const;
/** The three in-scope views (R12, D33). */
const VIEWS=['billing.person_windows_v','billing.subscription_latest_v','core.run_waiting_v'] as const;
/** The five context functions of schema rls (D27, D39), and V-18's trigger guards (FIX-S01-p1e; the engine tables). */
const FUNCTIONS=['billing.guard_own_references()','core.guard_own_references()','rls.context_owner_ref()','rls.context_user_id()',
 'rls.owns_execution_ref(text)','rls.owns_run(uuid)','rls.session_credential_hash()'] as const;
/** The six tables V-18's guard fires on, each by its trigger guard_own_references (FIX-S01-p1e). */
const GUARDED=['billing.cancel_token','billing.charge','billing.entitlement_event','billing.quote_use','billing.subscription_event',
 'billing.withdrawal_owner_settlement'] as const;
/** The 25 engine tables core.guard_own_references fires on, each by its trigger guard_own_references (V-18 on the engine tables). */
const ENGINE_GUARDED=['core.independence_receipt','core.node','core.reversal_point','core.staleness_state','core.stranger_restatement',
 'ledger.ledger_entry','ledger.node_strength_record','ledger.overlay_run','ledger.point_investigation','ledger.reduced_judgement',
 'ledger.sensitivity_record','ledger.verdict_vote','memory.alias_row','memory.candidate_record','memory.memory_link',
 'scorecard.session_assignment','serve.answer','serve.answer_story','serve.composed_text','serve.condition_mark',
 'serve.condition_mark_node','serve.conformance_record','serve.served_number','serve.synthesis_check_attempt','serve.synthesis_round'] as const;
const MARKER_ROLE='debateai_rls_all_accounts';
const POLICIES=['rls_account','rls_all_accounts'] as const;
/**
 * D38 and F-C1-1 (R28): the seven earlier steps whose postcondition digest pins the row-security flag of a table 0130
 * changes, with those tables (sorted; 0111's evidence digests the flag at migration-forward111.ts:23). The manifest carries the same list under `amendsPostconditionsOf`.
 */
const AMENDS:readonly PostconditionAmendment[]=Object.freeze([
 {step:'0111_billing_netopia.sql',relations:['billing.card_token','billing.card_token_revocation','billing.hosted_payment','billing.notice_quarantine','billing.payment_notice','billing.payment_notice_outcome','billing.payment_notice_raw','billing.status_read']},
 {step:'0117_debate_shape_map.sql',relations:['core.map_choice','core.map_item','core.map_position']},
 {step:'0119_reclaim_resume.sql',relations:['core.map_position_repoint']},
 {step:'0121_engine_verdict.sql',relations:['ledger.point_investigation','ledger.verdict_vote']},
 {step:'0122_engine_map_check.sql',relations:['core.map_answer_check','core.map_item_rests_on']},
 {step:'0123_side_by_side_releases.sql',relations:['core.run_supersession','ledger.model_spend_waiver']},
 {step:'0126_synthesis_check.sql',relations:['serve.synthesis_check_attempt','serve.synthesis_check_inheritance','serve.synthesis_check_removal_request','serve.synthesis_check_request','serve.synthesis_check_result']}
].map(({step,relations})=>Object.freeze({step,relations:Object.freeze(relations),field:'relrowsecurity' as const,value:true as const,policies:Object.freeze([...POLICIES])})));
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0130_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
/** Grantee name of an ACL item or policy role; oid 0 is PUBLIC. */
const GRANTEE="CASE WHEN %s=0 THEN 'PUBLIC' ELSE pg_get_userbyid(%s)::text END";
const grantee=(oid:string)=>GRANTEE.replaceAll('%s',oid);

/**
 * R29: for each in-scope table its row-security flag, its FORCE flag and every policy (name, command, roles as sorted
 * names with PUBLIC for oid 0, permissive flag, USING and WITH CHECK as pg_get_expr prints them); the views' options
 * and ACL items; the rls functions and V-18's two guards whole (owner, SECURITY DEFINER, settings, volatility, definition
 * digest, ACL items); each guard's trigger on each guarded table (enabled flag and definition with its arguments, null when
 * it is gone); the marker role's attributes. Not the marker's memberships: the provisioners grant it to logins after migrate().
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const tables=(await client.query(`
  SELECT relation,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname::text,'command',p.polcmd::text,
     'roles',(SELECT jsonb_agg(r.name ORDER BY r.name COLLATE "C") FROM (SELECT ${grantee('rid')} AS name FROM unnest(p.polroles) rid) r),
     'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    ORDER BY p.polname::text COLLATE "C") FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb) policies
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='r' ORDER BY relation COLLATE "C"`,[TABLES])).rows;
 if(tables.length!==TABLES.length)return fail('POSTCONDITION_OBJECTS');
 const views=(await client.query(`
  SELECT relation,c.reloptions options,
   (SELECT jsonb_agg(g.item ORDER BY g.item COLLATE "C") FROM (SELECT ${grantee('a.grantee')}||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='v' ORDER BY relation COLLATE "C"`,[VIEWS])).rows;
 if(views.length!==VIEWS.length)return fail('POSTCONDITION_OBJECTS');
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner)::text owner,p.prosecdef definer,p.proconfig config,p.provolatile::text volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item COLLATE "C") FROM (SELECT ${grantee('a.grantee')}||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature COLLATE "C"`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const guards=(await client.query(`
  SELECT relation,t.tgenabled::text enabled,pg_get_triggerdef(t.oid) definition
  FROM unnest($1::text[]) relation LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(relation) AND t.tgname='guard_own_references' AND NOT t.tgisinternal
  ORDER BY relation COLLATE "C"`,[[...GUARDED,...ENGINE_GUARDED]])).rows;
 const role=(await client.query(`
  SELECT r.rolname::text name,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls
  FROM pg_roles r WHERE r.rolname=$1`,[MARKER_ROLE])).rows;
 if(role.length!==1)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({tables,views,functions,guards,role}));
}

export async function loadForward0130(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier','amendsPostconditionsOf'])||raw.version!==VERSION||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==PREVIOUS||anchor.previousName!==PREVIOUS
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH||!digest(raw.verifier.sha256)
  ||JSON.stringify(raw.amendsPostconditionsOf)!==JSON.stringify(AMENDS))return fail('MANIFEST');
 const sqlBytes=await readFile(new URL(NAME,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(verifierBytes)!==raw.verifier.sha256)return fail('VERIFIER_DIGEST');
 return Object.freeze({name:NAME,version:VERSION,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql:sqlBytes.toString('utf8'),
  previousName:PREVIOUS,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath:VERIFIER_PATH,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence,
  amendsPostconditionsOf:AMENDS});
}
