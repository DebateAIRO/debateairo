import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The auth database batch as a forward step after dev's 0108 (design note
 * docs/superpowers/specs/2026-10-09-auth-db-batch-design.md; migrations/lineage/README.md). Its migration number lives
 * in NAME and its predecessor in PREVIOUS: a renumber edits these two constants, the manifest and the file name only.
 * It adds no billing object, so it keeps the effective-capability verifier of the step before it (the manifest names
 * that file) and checks its own objects with a supplemental verifier, run inside its postcondition evidence.
 */
const NAME='0109_auth_db_batch.sql';
const PREVIOUS='0108_preview_recovery_verified_bindings.sql';
const VERSION='auth-db-batch-forward-v1';
const MANIFEST_PATH='lineage/auth-db-batch-forward.json';
const SUPPLEMENTAL_PATH='lineage/verify-auth-db-batch.sql';
const EFFECTIVE_VERIFIER=/^lineage\/verify-effective-capabilities(?:-[0-9]{3,4})?\.sql$/;
export const AUTH_DB_BATCH_MIGRATION=NAME;
/** Every function this step creates or replaces; their definitions, owners, settings and grants are its postcondition. */
export const AUTH_DB_BATCH_FUNCTIONS=Object.freeze([
 'identity.create_pending_account_base_internal(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz)',
 'identity.create_social_account(jsonb,jsonb)',
 'identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb)',
 'identity.complete_social_login(jsonb,jsonb)',
 'identity.complete_social_step_up(jsonb,jsonb)',
 'identity.prove_consumer_recovery(jsonb,jsonb)',
 'identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)',
 'identity.password_recovery_accept_code(text,uuid,text,jsonb)',
 'identity.mfa_recovery_read(text)',
 'identity.mfa_recovery_complete(text,text,jsonb)',
 'identity.mfa_recovery_cancel(text,jsonb)',
 'identity.mfa_recovery_risk(text,text)',
 'identity.mfa_recovery_failure(text,text,jsonb)',
 'identity.mfa_recovery_notice_event(uuid,text)',
 'identity.mfa_recovery_claim_notice(integer)',
 'identity.mfa_recovery_waiting_current(uuid)',
 'identity.mfa_recovery_prepare_wait(text)',
 'identity.mfa_recovery_begin_wait(text,text,text,text,jsonb,jsonb)',
 'identity.mfa_recovery_prepare_finish(text)',
 'identity.mfa_recovery_finish(text,text,text,jsonb)',
 'identity.mfa_recovery_pending_read(jsonb)',
 'identity.mfa_recovery_pending_cancel(jsonb,jsonb)',
 'identity.mfa_recovery_link_waiting(text)',
 'identity.append_consumer_security_audit_internal(uuid,text,jsonb)',
 'staff.require_alert_readiness_jit()',
 'staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz)',
 'staff.revoke_independent_alert_readiness(uuid)',
 'staff.release_alert_delivery(uuid,uuid)',
 'staff.claim_alert_delivery(integer)'
] as const);
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD_AUTH_DB_BATCH_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

function postconditionEvidence(supplementalSql:string){
 return async (client:PoolClient):Promise<string>=>{
  await client.query(supplementalSql);
  const rows=(await client.query(`
   SELECT 'function' AS kind,signature AS name,jsonb_build_object(
     'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,
     'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
     'acl',(SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g)) AS facts
   FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature)
   UNION ALL
   SELECT 'constraint',c.conrelid::regclass::text||'.'||c.conname,jsonb_build_object('definition',pg_get_constraintdef(c.oid))
   FROM pg_constraint c WHERE (c.conrelid,c.conname) IN (('identity.mfa_recovery_control'::regclass,'mfa_recovery_control_stage_check'),
    ('identity.mfa_recovery_control'::regclass,'mfa_recovery_control_wait_check'),('identity.mfa_recovery_notice'::regclass,'mfa_recovery_notice_event_kind_check'),
    ('identity.consumer_security_notice'::regclass,'consumer_security_notice_event_kind_check'))
   UNION ALL
   SELECT 'column','identity.mfa_recovery_control.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull)
   FROM pg_attribute a WHERE a.attrelid='identity.mfa_recovery_control'::regclass AND a.attname IN ('waiting_at','not_before','finish_hash','wait_cancel_hash') AND NOT a.attisdropped
   UNION ALL
   SELECT 'role',r.rolname,jsonb_build_object('login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,
     'replication',r.rolreplication,'bypassrls',r.rolbypassrls,'connections',r.rolconnlimit,
     'memberOf',(SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid),'members',(SELECT count(*) FROM pg_auth_members m WHERE m.roleid=r.oid),
     'validUntil',r.rolvaliduntil,'settings',(SELECT count(*) FROM pg_db_role_setting s WHERE s.setrole=r.oid))
   FROM pg_roles r WHERE r.rolname='debateai_staff_readiness_writer'
   UNION ALL
   SELECT 'database',current_database(),jsonb_build_object('publicTemporary',EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='TEMPORARY'))
   ORDER BY 1,2
  `,[AUTH_DB_BATCH_FUNCTIONS])).rows;
  if(rows.length!==AUTH_DB_BATCH_FUNCTIONS.length+4+4+1+1)return fail('POSTCONDITION_OBJECTS');
  return sha(JSON.stringify(rows));
 };
}

export async function loadForwardAuthDbBatch(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier','supplementalVerifier'])||raw.version!==VERSION||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==PREVIOUS||anchor.previousName!==PREVIOUS
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||typeof raw.verifier.path!=='string'||!EFFECTIVE_VERIFIER.test(raw.verifier.path)||raw.verifier.sha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.supplementalVerifier,['path','sha256'])||raw.supplementalVerifier.path!==SUPPLEMENTAL_PATH||!digest(raw.supplementalVerifier.sha256))return fail('MANIFEST');
 const sqlBytes=await readFile(new URL(NAME,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const verifierBytes=await readFile(new URL(raw.verifier.path,directory));
 if(sha(verifierBytes)!==raw.verifier.sha256)return fail('VERIFIER_DIGEST');
 const supplementalBytes=await readFile(new URL(SUPPLEMENTAL_PATH,directory));
 if(sha(supplementalBytes)!==raw.supplementalVerifier.sha256)return fail('VERIFIER_DIGEST');
 return Object.freeze({name:NAME,version:VERSION,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql:sqlBytes.toString('utf8'),
  previousName:PREVIOUS,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath:raw.verifier.path,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),
  postconditionEvidence:postconditionEvidence(supplementalBytes.toString('utf8')),
  // Re-run on every later migrate(), also once other steps follow this one (migration-forward-chain.ts).
  replayVerifierSql:supplementalBytes.toString('utf8')});
}
