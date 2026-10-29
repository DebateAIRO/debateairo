import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The security fixes of audit run 3 as one chain step after row-level security 0130 (migrations/lineage/README.md):
 * one SQL file in sections, one per issue, each opened by `-- ==== [<issue id>] <short title> ====`. An `expand` step:
 * every section adds new objects and alters, replaces and revokes nothing older, except a statement its SQL marks with a
 * `-- n1: reviewed <reason>` line (NV-13 re-creates 0101's two origin constraint triggers on a new function, a binding no
 * earlier step digests; NV-50 replaces 0074's shared spend-source CHECK on ledger.model_spend wider and adds a NOT VALID
 * CHECK there, which no earlier step's postcondition pins), so no earlier step's digest moves. It
 * keeps 0130's effective verifier in force; it adds no billing relation or function, so it names that verifier as its
 * own. Its checks are its postcondition (below), compared on every later migrate(), one group per section; it has no
 * supplemental verifier, so no replayVerifierSql. Its n1 header (`-- n1: expand`, `-- n1: keeps-verifier`) is read from
 * its SQL by the chain.
 */
const NAME='0131_security_fixes_run3.sql';
const VERSION='security-fixes-run3-forward0131-v1';
const MANIFEST_PATH='lineage/security-fixes-run3-forward0131.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-130.sql'; // README step 3: 0131 adds no billing relation or billing function, so it names the verifier in force (0130's, which 0131 to 0135 keep)
const PREVIOUS='0130_row_level_security.sql';
/**
 * Each section's objects, in the SQL file's section order (the loader refuses MIGRATION_FORWARD0131_SECTIONS when the
 * file's `-- ==== [<id>]` headers and this list disagree). A function is digested whole (owner, definer, path,
 * volatility, definition digest, ACL); a table whole (owner, ACL, columns, constraints, indexes, triggers, rules,
 * sequence ACL), as 0124 does. A section may also name `tablePrivileges`, each the answer of
 * has_table_privilege(role, table, privilege) for a grant it adds on a table an earlier step owns (that table's own
 * ACL belongs to the earlier step's evidence); the key appears in that section's group only. A section may name
 * `schemas` it creates, each digested (owner, ACL) in that section's group only. A section may name `triggers` it
 * re-creates on a table an earlier step owns (a reviewed swap), each digested (enabled, pg_get_triggerdef) in that
 * section's group only, so the binding is checked without freezing that table. A section may name `constraints` it adds
 * on a table an earlier step owns, each digested (name, type, definition without a trailing NOT VALID, so a later
 * VALIDATE is not drift) in that section's group only; never that table under `tables`, which would pin its shared
 * spend-source list (0118's ruling W-0117). A later section inserts its own entry just before NV-50's, which stays last,
 * with only the objects it adds, and keeps every earlier entry as it is.
 */
type TablePrivilege=Readonly<{role:string;table:string;privilege:string}>;
type TriggerBinding=Readonly<{table:string;name:string}>;
type ConstraintSet=Readonly<{table:string;names:readonly string[]}>;
type Section=Readonly<{id:string;functions:readonly string[];tables:readonly string[];tablePrivileges?:readonly TablePrivilege[];schemas?:readonly string[];triggers?:readonly TriggerBinding[];constraints?:readonly ConstraintSet[]}>;
const SECTIONS:readonly Section[]=Object.freeze([
 // [NV-16] the bounded MFA-recovery start: at most three starts per account and destination per rolling hour.
 {id:'NV-16',functions:['identity.mfa_recovery_start_bounded(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid)'],tables:[]},
 // [NV-18] the sweeper that closes recovery bindings left open past one hour (installer-owned, EXECUTE to debateai_runtime).
 {id:'NV-18',functions:['identity.expire_stale_account_recovery_bindings(integer)'],tables:[]},
 // [NV-15] the account-level MFA-recovery failure recorder, and its owner's INSERT on 0046's risk-signal table.
 {id:'NV-15',functions:['identity.mfa_recovery_record_failure(text,text,jsonb,jsonb)'],tables:[],
  tablePrivileges:[{role:'debateai_mfa_recovery_owner',table:'identity.authentication_risk_signal',privilege:'INSERT'}]},
 // [NV-40] the password-reset claim that dead-letters every unleased stale PROOF before it claims (0116's claim stays).
 {id:'NV-40',functions:['identity.password_reset_claim_pending_notice(integer)'],tables:[]},
 // [NV-01] the legacy-run claim's per-account attempt budget: its counter table and the admit/clear pair (installer-owned, EXECUTE to debateai_runtime).
 {id:'NV-01',functions:['core.legacy_claim_admit(uuid,bigint,integer,bigint)','core.legacy_claim_clear(uuid)'],tables:['core.legacy_claim_lockout']},
 // [NV-12] the per-account email-change send window and the two bounded entry points that share it (installer-owned, EXECUTE to debateai_authorization_runtime).
 {id:'NV-12',functions:['identity.request_email_change_bounded(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb,integer,bigint)','identity.resend_email_change_bounded(uuid,uuid,text,timestamptz,bigint,jsonb,integer,bigint,bigint)'],tables:['identity.email_change_send_window']},
 // [NV-08] the run-key provision claim that skips owners the intent trigger refuses, in the new schema erasure_reconcile
 // (its owner and ACL, which also record the later K02 sections' USAGE grants on it, are digested here once).
 {id:'NV-08',functions:['erasure_reconcile.claim_run_key_provision_cleanup(integer)'],tables:[],schemas:['erasure_reconcile']},
 // [NV-04] the durable login TOTP budget: one row per (account, factor), its admit and its clear (installer-owned, EXECUTE to debateai_authorization_runtime).
 {id:'NV-04',functions:['identity.totp_login_admit(uuid,uuid,integer,bigint,bigint)','identity.totp_login_clear(uuid,uuid)'],tables:['identity.totp_login_lockout']},
 // [NV-38] the backup-email and MFA-recovery pending-notice claims: the lease starts when the claim ends, and the
 // stale-notice sweep skips rows another claim or finish holds.
 {id:'NV-38',functions:['identity.backup_email_claim_pending_notice(integer)','identity.mfa_recovery_claim_pending_notice(integer)'],tables:[]},
 // [NV-07] the restore fence: one singleton row and three functions (begin, settle, owner's hold release).
 {id:'NV-07',functions:['identity.restore_fence_begin_v1()','identity.restore_fence_release_public_hold_v1(text)','identity.restore_fence_settle_v1(text,text)'],tables:['identity.restore_fence']},
 // [NV-17] the password-reset proof counter per account (reset-owner-owned, TRUNCATE-guarded, no grantee) and the guarded
 // start, reserve, settle and complete (owned by the reset owner, EXECUTE to debateai_password_reset_runtime).
 {id:'NV-17',functions:['identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)','identity.password_reset_proof_reserve(text,jsonb,bigint)','identity.password_reset_proof_refused(text,jsonb)','identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb)'],tables:['identity.password_reset_retry_lock']},
 // [NV-13] an untrusted social sign-up links no provider (create v2 + origin trigger v2); a pending link answers like none (callback v2).
 // Its `triggers` digest the one reviewed swap: 0101's two origin constraint triggers, re-created on the v2 check.
 {id:'NV-13',functions:['identity.require_social_password_origin_v2()','identity.create_social_account_v2(jsonb,jsonb)','identity.finish_social_callback_v2(jsonb,jsonb)'],tables:[],
  triggers:[{table:'identity."user"',name:'social_password_origin'},{table:'identity.social_identity',name:'social_password_origin_link'}]},
 // [NV-02] the erasure-notice fail with a terminal state (a dead letter and its audit event), in erasure_reconcile
 // (EXECUTE and the schema's USAGE to debateai_erasure_runtime; that USAGE is in NV-08's schema ACL digest).
 {id:'NV-02',functions:['erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text)'],tables:[]},
 // [NV-14] verify-email sets the token holder's password on every valid consume and drops pending social links.
 {id:'NV-14',functions:['identity.consume_verification_set_password(text,timestamptz,jsonb,text)'],tables:[]},
 // [NV-30] the private-debate delete's entry point: 0123's grant check first, then one try of the named run's content
 // lease (never a wait), then 0123's prepare (EXECUTE to debateai_erasure_runtime; its schema USAGE is in NV-08's ACL digest).
 {id:'NV-30',functions:['erasure_reconcile.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)'],tables:[]},
 // [NV-41] the ceremony-store cleanups that give up the heaviest anonymous source's oldest rows between the two marks.
 {id:'NV-41',functions:['identity.prune_consumer_passkey_challenges_evicting(integer)','identity.prune_social_flows_evicting(integer)'],tables:[]},
 // [NV-09] copies of 0040's preview and 0110's PREPARE that also admit an owner the age gate froze after scheduling
 // (EXECUTE to debateai_erasure_runtime; its schema USAGE is in NV-08's ACL digest).
 {id:'NV-09',functions:['erasure_reconcile.account_erasure_preview(uuid)','erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])'],tables:[]},
 // [NV-39] the three recovery source-window admits that evict a bounded batch at capacity.
 {id:'NV-39',functions:['identity.backup_email_admit_evicting(uuid,text,jsonb,bigint)','identity.mfa_recovery_admit_evicting(jsonb,bigint)','identity.password_reset_admit_evicting(jsonb,bigint)'],tables:[]},
 // [NV-50] LAST (its ACCESS EXCLUSIVE lock on ledger.model_spend lasts until COMMIT): the new restriction that every
 // unanswered attempt's row names its run and attempt. The shared source list it widens is never pinned (W-0117).
 {id:'NV-50',functions:[],tables:[],constraints:[{table:'ledger.model_spend',names:['model_spend_unanswered_names_its_attempt']}]}
]);
const SECTION_HEADER=/^-- ==== \[([A-Za-z0-9-]+)\] \S.* ====$/gmu;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0131_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

async function functionEvidence(client:PoolClient,signatures:readonly string[]):Promise<unknown[]>{
 if(signatures.length===0)return [];
 const rows=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[signatures])).rows;
 if(rows.length!==signatures.length)return fail('POSTCONDITION_OBJECTS');
 return rows;
}

async function tableEvidence(client:PoolClient,relations:readonly string[]):Promise<unknown[]>{
 if(relations.length===0)return [];
 const rows=(await client.query(`
  SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
   (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM pg_depend dep JOIN pg_class s ON s.oid=dep.objid AND s.relkind='S',aclexplode(coalesce(s.relacl,acldefault('s',s.relowner))) a WHERE dep.refobjid=c.oid AND dep.classid='pg_class'::regclass AND dep.deptype IN ('a','i')) g) sequence_acl
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='r' ORDER BY relation`,[relations])).rows;
 if(rows.length!==relations.length)return fail('POSTCONDITION_OBJECTS');
 return rows;
}

async function tablePrivilegeEvidence(client:PoolClient,privileges:readonly TablePrivilege[]):Promise<unknown[]>{
 return (await client.query(`
  SELECT f.role,f.relation,f.privilege,has_table_privilege(f.role,f.relation,f.privilege) granted
  FROM unnest($1::text[],$2::text[],$3::text[]) f(role,relation,privilege) ORDER BY 1,2,3`,
  [privileges.map(p=>p.role),privileges.map(p=>p.table),privileges.map(p=>p.privilege)])).rows;
}

async function schemaEvidence(client:PoolClient,schemas:readonly string[]):Promise<unknown[]>{
 const rows=(await client.query(`
  SELECT schema_name,pg_get_userbyid(n.nspowner) owner,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) g) acl
  FROM unnest($1::text[]) schema_name JOIN pg_namespace n ON n.oid=to_regnamespace(schema_name) ORDER BY schema_name`,[schemas])).rows;
 if(rows.length!==schemas.length)return fail('POSTCONDITION_OBJECTS');
 return rows;
}

async function triggerEvidence(client:PoolClient,triggers:readonly TriggerBinding[]):Promise<unknown[]>{
 const rows=(await client.query(`
  SELECT f.relation,f.name,t.tgenabled::text enabled,pg_get_triggerdef(t.oid) definition
  FROM unnest($1::text[],$2::text[]) f(relation,name) JOIN pg_trigger t ON t.tgrelid=to_regclass(f.relation) AND t.tgname=f.name AND NOT t.tgisinternal ORDER BY 1,2`,
  [triggers.map(t=>t.table),triggers.map(t=>t.name)])).rows;
 if(rows.length!==triggers.length)return fail('POSTCONDITION_OBJECTS');
 return rows;
}

async function constraintEvidence(client:PoolClient,constraints:readonly ConstraintSet[]):Promise<unknown[]>{
 const named=constraints.flatMap(set=>set.names.map(name=>({table:set.table,name})));
 const rows=(await client.query(`
  SELECT f.relation,k.conname,k.contype::text contype,regexp_replace(pg_get_constraintdef(k.oid),'\\s+NOT VALID$','') definition
  FROM unnest($1::text[],$2::text[]) f(relation,name) JOIN pg_constraint k ON k.conrelid=to_regclass(f.relation) AND k.conname=f.name ORDER BY 1,2`,
  [named.map(c=>c.table),named.map(c=>c.name)])).rows;
 if(rows.length!==named.length)return fail('POSTCONDITION_OBJECTS');
 return rows;
}

/** One group per section, in section order: the section's id, its functions and tables whole, and its named privileges. */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const sections:unknown[]=[];
 for(const section of SECTIONS){
  sections.push({id:section.id,functions:await functionEvidence(client,section.functions),tables:await tableEvidence(client,section.tables),
   ...(section.tablePrivileges===undefined?{}:{tablePrivileges:await tablePrivilegeEvidence(client,section.tablePrivileges)}),
   ...(section.schemas===undefined?{}:{schemas:await schemaEvidence(client,section.schemas)}),
   ...(section.triggers===undefined?{}:{triggers:await triggerEvidence(client,section.triggers)}),
   ...(section.constraints===undefined?{}:{constraints:await constraintEvidence(client,section.constraints)})});
 }
 return sha(JSON.stringify({sections}));
}

export async function loadForward0131(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier'])||raw.version!==VERSION||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==PREVIOUS||anchor.previousName!==PREVIOUS
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH||!digest(raw.verifier.sha256))return fail('MANIFEST');
 const sqlBytes=await readFile(new URL(NAME,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const sql=sqlBytes.toString('utf8');
 const headers=[...sql.matchAll(SECTION_HEADER)].map(match=>match[1]);
 if(headers.length!==SECTIONS.length||headers.some((id,index)=>id!==SECTIONS[index]!.id))return fail('SECTIONS');
 const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(verifierBytes)!==raw.verifier.sha256)return fail('VERIFIER_DIGEST');
 return Object.freeze({name:NAME,version:VERSION,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql,
  previousName:PREVIOUS,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath:VERIFIER_PATH,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence});
}
