import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * Settings changes without an upload (side-by-side spec 2026-10-21 §13; plan S, task S1) as the chain step after the
 * side-by-side releases step 0123 (migrations/lineage/README.md): three new append-only tables in schema register (the
 * activation pointer register.settings_activation, the verdict log register.settings_verdict and the switch's check
 * rows register.settings_switch_check, the last with its deferred constraint trigger), and ten new functions owned by
 * 0123's NOLOGIN debateai_release_owner: the two pass readers, the pointer's reader, the verdict writer, the activation,
 * the switch's hook (which 0123's core.record_release_switch already calls), the commit check and the three insert
 * guards. An `expand` step: it alters, replaces and revokes nothing older, so 0123's digest stays as it was. It keeps
 * 0111's effective verifier in force; it adds no billing relation or function, so it names that verifier as its own.
 * Its checks are its postcondition (below), compared on every later migrate(); it has no supplemental verifier, so no
 * replayVerifierSql. Its n1 header (`-- n1: expand`, `-- n1: keeps-verifier`) is read from its SQL by the chain.
 */
const NAME='0124_settings_activation.sql';
const VERSION='settings-activation-forward0124-v1';
const MANIFEST_PATH='lineage/settings-activation-forward0124.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0124 adds no billing relation or billing function, so it names the verifier in force (0111's, which 0112 to 0124 keep)
const PREVIOUS='0123_side_by_side_releases.sql';
/** The tables 0124 adds, whole (owner, ACL, columns, constraints, indexes, triggers, rules, sequence ACL), as 0123 does. */
const TABLES=['register.settings_activation','register.settings_switch_check','register.settings_verdict'] as const;
/** The ten functions 0124 adds, whole (owner, definer, path, volatility, definition digest, ACL). */
const FUNCTIONS=['register.activate_settings_version(bigint,bigint,text,text,text)','register.read_active_settings_version()',
 'register.read_passed_settings_versions(text)','register.record_settings_verdict(text,bigint,text,text)',
 'register.release_switch_settings_hook(text,bigint)','register.settings_activation_insert_guard()',
 'register.settings_switch_check_at_commit()','register.settings_switch_check_insert_guard()',
 'register.settings_verdict_insert_guard()','register.settings_version_passed(text,bigint)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0124_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/**
 * 0124's three tables whole (the constraint trigger and its pg_constraint row included: non-internal triggers and every
 * constraint of the table) and its ten functions whole, as 0123 digests its own. Only what 0124 adds: the foreign keys'
 * internal triggers on register.register_version are internal, and that table's own columns, constraints and ACL belong
 * to earlier files.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 const tables=(await client.query(`
  SELECT relation,pg_get_userbyid(c.relowner) owner,c.relkind,c.relpersistence,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns,
   (SELECT jsonb_agg(k.conname||':'||pg_get_constraintdef(k.oid) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) constraints,
   (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) indexes,
   (SELECT jsonb_agg(t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) triggers,
   (SELECT jsonb_agg(pg_get_ruledef(r.oid) ORDER BY r.rulename) FROM pg_rewrite r WHERE r.ev_class=c.oid) rules,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM pg_depend dep JOIN pg_class s ON s.oid=dep.objid AND s.relkind='S',aclexplode(coalesce(s.relacl,acldefault('s',s.relowner))) a WHERE dep.refobjid=c.oid AND dep.classid='pg_class'::regclass AND dep.deptype IN ('a','i')) g) sequence_acl
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='r' ORDER BY relation`,[TABLES])).rows;
 if(tables.length!==TABLES.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({functions,tables}));
}

export async function loadForward0124(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
  verifierPath:VERIFIER_PATH,verifierSha256:raw.verifier.sha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence});
}
