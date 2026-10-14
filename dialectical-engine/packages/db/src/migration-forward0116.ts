import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/** The mail locale carrier as the chain step after the data export's 0115 (mission email-locale, S01-C05; migrations/lineage/README.md). */
const NAME='0116_mail_locale.sql';
const VERSION='mail-locale-forward0116-v1';
const MANIFEST_PATH='lineage/mail-locale-forward0116.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README: 0116 adds no billing relation or function, so it names the verifier in force (0111's, which 0112 to 0115 keep)
const PREVIOUS='0115_data_export.sql';
const NOTICE_TABLES=['account_erasure_notification_outbox','consumer_security_notice','password_reset_notice','backup_email_notice','mfa_recovery_notice'] as const;
const WRITERS=[
 'identity.enqueue_consumer_security_notice_internal(uuid,text)',
 'identity.enqueue_recovery_method_notice_internal(uuid)',
 'identity.password_reset_notice_event(uuid,text)',
 'identity.backup_email_start(uuid,text,text,uuid,jsonb,bigint,bigint,text,jsonb,jsonb,bigint,uuid)',
 'identity.backup_email_confirm(text,jsonb)',
 'identity.mfa_recovery_start(bytea,text,uuid,uuid[],text,text,jsonb,jsonb,bigint,uuid)',
 'identity.cancel_current_account_erasure(uuid,uuid,uuid,uuid)'
] as const;
/** Sealed by applied steps 108, 110 and 0112 (migrations/lineage/README.md): redefined by no step, carried by the fill trigger. */
const TRIGGER_COVERED=[
 'identity.password_reset_start(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)',
 'identity.mfa_recovery_begin_wait(text,text,text,text,jsonb,jsonb)',
 'identity.mfa_recovery_notice_event(uuid,text)',
 'identity.schedule_account_erasure(uuid,uuid,uuid,text,boolean)',
 'identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])',
 'identity.mfa_recovery_claim_notice(integer)'
] as const;
const READERS=[
 'identity.read_consumer_security_notice(uuid,uuid)',
 'identity.password_reset_claim_notice(integer)',
 'identity.backup_email_claim_notice(integer)'
] as const;
const SOCIAL=['identity.begin_social_flow(jsonb)','identity.finish_social_callback(jsonb,jsonb)'] as const;
const FUNCTIONS=[...WRITERS,...READERS,...SOCIAL,'identity.fill_mail_locale()','identity.mail_locale_of_mfa_claim(uuid,uuid)','identity.require_mail_locale()','identity.account_erasure_schedule_locale(uuid)','identity.account_erasure_notification_mail_locale(uuid,uuid)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0116_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/**
 * The carrier as 0116 leaves it: the 12 writers, the 5 readers, the two social functions and the guard function (their
 * definitions, owners, grants), the five notice tables and social_flow (columns, CHECKs, the guard triggers).
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const tables=(await client.query(`
  SELECT c.relname table_name,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers
  FROM pg_class c WHERE c.oid IN (${[...NOTICE_TABLES,'social_flow'].map(name=>`to_regclass('identity.${name}')`).join(',')}) ORDER BY c.relname`)).rows;
 if(tables.length!==NOTICE_TABLES.length+1)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,tables}));
}

/** The SQL that re-checks the carrier on every migrate(): each writer still reads the setting, and the five tables keep the guard. */
const REPLAY_VERIFIER_SQL=`DO $mail_locale_0116$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='identity' AND p.proname=ANY(ARRAY[${WRITERS.map(sig=>`'${sig.slice('identity.'.length,sig.indexOf('('))}'`).join(',')}])
        AND position('current_setting(''debateai.mail_locale''' IN pg_get_functiondef(p.oid))>0)<>${WRITERS.length} THEN
    RAISE EXCEPTION 'MIGRATION_FORWARD0116_CARRIER_DRIFT writers';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='identity' AND p.proname=ANY(ARRAY[${TRIGGER_COVERED.map(sig=>`'${sig.slice('identity.'.length,sig.indexOf('('))}'`).join(',')}])
        AND position('mail_locale' IN pg_get_functiondef(p.oid))>0)<>0 THEN
    RAISE EXCEPTION 'MIGRATION_FORWARD0116_SEALED_BODY_TOUCHED';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='identity' AND c.relname=ANY(ARRAY[${NOTICE_TABLES.map(name=>`'${name}'`).join(',')}])
        AND t.tgname='mail_locale_fill' AND NOT t.tgisinternal AND (t.tgtype&2)=2 AND (t.tgtype&4)=4 AND t.tgenabled='O')<>${NOTICE_TABLES.length} THEN
    RAISE EXCEPTION 'MIGRATION_FORWARD0116_CARRIER_DRIFT fill';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='identity' AND c.relname=ANY(ARRAY[${NOTICE_TABLES.map(name=>`'${name}'`).join(',')}])
        AND t.tgname='mail_locale_guard' AND NOT t.tgisinternal AND (t.tgtype&2)=2 AND (t.tgtype&4)=4 AND t.tgenabled='O')<>${NOTICE_TABLES.length} THEN
    RAISE EXCEPTION 'MIGRATION_FORWARD0116_CARRIER_DRIFT guard';
  END IF;
  IF NOT has_function_privilege('debateai_erasure_runtime','identity.account_erasure_schedule_locale(uuid)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid='identity.account_erasure_schedule_locale(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_FORWARD0116_CARRIER_DRIFT erasure reader';
  END IF;
END
$mail_locale_0116$;`;

export async function loadForward0116(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(MANIFEST_PATH,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier'])||raw.version!==VERSION||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==PREVIOUS||anchor.previousName!==PREVIOUS
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==NAME||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||raw.verifier.path!==VERIFIER_PATH||!digest(raw.verifier.sha256))return fail('MANIFEST');
 const sqlBytes=await readFile(new URL(NAME,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const verifierBytes=await readFile(new URL(VERIFIER_PATH,directory));
 if(sha(verifierBytes)!==raw.verifier.sha256)return fail('VERIFIER_DIGEST');
 return Object.freeze({name:NAME,version:VERSION,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql:sqlBytes.toString('utf8'),
  previousName:PREVIOUS,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath:VERIFIER_PATH,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence,
  replayVerifierSql:REPLAY_VERIFIER_SQL});
}
