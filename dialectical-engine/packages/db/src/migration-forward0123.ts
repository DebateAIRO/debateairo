import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * Side-by-side releases (spec 2026-10-21 §1, §5; plan A, tasks A1-A5) as the chain step after engine 2's map answer
 * step 0122 (migrations/lineage/README.md): the transition release T's one migration, built section by section. §1
 * stamps every run with its release (core.run.release_key and its CHECK run_release_key_shape); §2 redefines
 * core.create_encrypted_run(jsonb,uuid,uuid,jsonb) in place (0072's body plus the stamp) so the encrypted insert path
 * writes it; §3 adds the release table core.release_event, its view core.release_state_v, its two readers and its two
 * serialized writers, owned by the new NOLOGIN role debateai_release_owner (the writers callable by
 * debateai_release_operator); §4 adds the re-admission record core.run_supersession with its guard
 * core.guard_run_supersession(), the start guard core.refuse_starting_superseded_run() (its trigger on
 * core.run_wait_start is checked by the closing block), core.resolve_run_ref(uuid), the readmitted run's key provision
 * and its commit lock, the marker columns on core.run_key_provision_intent and identity.run_execution_binding (one live
 * re-admission per old run), core.list_unstarted_readmissions(uuid) (the re-admissions whose START never committed,
 * plan C11 review), and redefines core.run_waiting_v; §5 widens core.run_wait_reason's waits_for CHECK; §6
 * redefines in place the five funding functions that tied a grant to the selection's or the run's version (billing's
 * reserve_internal_provider_call, read_internal_run_state, read_internal_allowance and guard_internal_charge_scope, and
 * staff.revoke_internal_allowance), and staff.read_self_allowance_command so a revoke names its grant's own version,
 * and adds staff.read_internal_funding_policy_at(bigint); §7 adds the append-only spend waiver ledger.model_spend_waiver
 * and redefines billing.read_internal_grant_spent in place so a waived run leaves a funded person's window; §8 adds the
 * chain reader core.private_erasure_run_chain(uuid) (a debate's runs, linked by the re-admission marker) and redefines
 * the per-debate private erasure (prepare, resume, finalize) in place so deleting a debate erases every run of its
 * re-admission chain (addendum A-x3). The view, that
 * CHECK, the two indexes on the marker and the ten redefinitions of §6, §7 and §8 are checked by the closing block and
 * by tests, not digested, so a later drained step may widen or redefine them again (as 0121's CHECKs are handled).
 * It adds no billing relation and no billing function, so the effective verifier in force (0111's) stays in force and
 * is named as its own. Its checks are its postcondition (below), compared on every later migrate(); it has no
 * supplemental verifier, so no replayVerifierSql. Each later section appends its objects to the lists below.
 */
const NAME='0123_side_by_side_releases.sql';
const VERSION='side-by-side-releases-forward0123-v1';
const MANIFEST_PATH='lineage/side-by-side-releases-forward0123.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0123 adds no billing relation or billing function, so it names the verifier in force (0111's, which 0112 to 0123 keep)
const PREVIOUS='0122_engine_map_check.sql';
/** §1, §4: the columns 0123 adds, as table.column. */
const COLUMNS=['core.run.release_key','core.run_key_provision_intent.readmitted_from_run_id',
 'identity.run_execution_binding.readmitted_from_run_id'] as const;
/** §1: the CHECKs 0123 adds, as table.constraint. */
const CONSTRAINTS=['core.run.run_release_key_shape'] as const;
/**
 * §2: the function 0123 redefines in place, §3: the four it adds, §4: the six it adds, §6: the one it adds, §8: the
 * one it adds (whole: owner, definer, path, volatility, definition, ACL).
 */
const FUNCTIONS=['core.create_encrypted_run(jsonb,uuid,uuid,jsonb)','core.guard_run_supersession()',
 'core.list_unstarted_readmissions(uuid)','core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)',
 'core.prepare_readmitted_run_key_provision(uuid,uuid)','core.private_erasure_run_chain(uuid)',
 'core.read_current_release()','core.read_release_state(text)',
 'core.record_release_event(text,text,text,text)','core.record_release_switch(text,text,timestamptz,text,bigint)',
 'core.refuse_starting_superseded_run()','core.resolve_run_ref(uuid)','staff.read_internal_funding_policy_at(bigint)'] as const;
/** §3, §4, §7: the tables 0123 adds, whole (owner, ACL, columns, constraints, indexes, triggers, rules), as 0122 does. */
const TABLES=['core.release_event','core.run_supersession','ledger.model_spend_waiver'] as const;
/** §3: the view 0123 adds (owner, ACL, definition). */
const VIEWS=['core.release_state_v'] as const;
/** §3: the two NOLOGIN NOINHERIT roles 0123 adds (their attributes and memberships). */
const ROLES=['debateai_release_operator','debateai_release_owner'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0123_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
/** 'schema.table.name' → ['schema.table','name']. */
const split=(qualified:string):readonly [string,string]=>[qualified.slice(0,qualified.lastIndexOf('.')),qualified.slice(qualified.lastIndexOf('.')+1)];

/**
 * 0123's columns (type, NOT NULL, default), its CHECKs by name, validation and definition, the functions it redefines or
 * adds (owner, SECURITY DEFINER, search_path, volatility, definition digest and ACL), as 0120 digests its own, its table
 * whole as 0122 digests its tables, its view (owner, ACL, definition digest) and its roles' attributes and memberships.
 * Only what 0123 adds or redefines: core.run's other columns and constraints belong to earlier files.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const columns=(await client.query(`
  SELECT qualified,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value
  FROM unnest($1::text[],$2::text[],$3::text[]) AS wanted(qualified,relation,name)
  JOIN pg_attribute a ON a.attrelid=to_regclass(wanted.relation) AND a.attname=wanted.name AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ORDER BY qualified`,
  [COLUMNS,COLUMNS.map(name=>split(name)[0]),COLUMNS.map(name=>split(name)[1])])).rows;
 if(columns.length!==COLUMNS.length)return fail('POSTCONDITION_OBJECTS');
 const constraints=(await client.query(`
  SELECT qualified,k.convalidated validated,pg_get_constraintdef(k.oid) definition
  FROM unnest($1::text[],$2::text[],$3::text[]) AS wanted(qualified,relation,name)
  JOIN pg_constraint k ON k.conrelid=to_regclass(wanted.relation) AND k.conname=wanted.name ORDER BY qualified`,
  [CONSTRAINTS,CONSTRAINTS.map(name=>split(name)[0]),CONSTRAINTS.map(name=>split(name)[1])])).rows;
 if(constraints.length!==CONSTRAINTS.length)return fail('POSTCONDITION_OBJECTS');
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
 const views=(await client.query(`
  SELECT relation,pg_get_userbyid(c.relowner) owner,c.reloptions options,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT pg_get_userbyid(a.grantee)||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) g) acl,
   encode(sha256(convert_to(pg_get_viewdef(c.oid),'UTF8')),'hex') definition
  FROM unnest($1::text[]) relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='v' ORDER BY relation`,[VIEWS])).rows;
 if(views.length!==VIEWS.length)return fail('POSTCONDITION_OBJECTS');
 const roles=(await client.query(`
  SELECT r.rolname,r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
   (SELECT jsonb_agg(pg_get_userbyid(m.roleid) ORDER BY pg_get_userbyid(m.roleid)) FROM pg_auth_members m WHERE m.member=r.oid) member_of
  FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`,[ROLES])).rows;
 if(roles.length!==ROLES.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({columns,constraints,functions,tables,views,roles}));
}

export async function loadForward0123(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
