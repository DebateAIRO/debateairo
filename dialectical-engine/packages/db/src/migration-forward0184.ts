import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The staff re-key permit as one chain step after 0182, the MFA recovery control user index (migrations/lineage/README.md
 * "The staff re-key permit (0184)"). A staff key belongs to one site name, so after the site is renamed a staff member has
 * no key that works, and the older functions refuse to enrol a new one from password and authenticator code alone. This
 * step adds a permit an operator on the server arms for one person and one sign-in of theirs: it is used once, lasts at
 * most 15 minutes, and lets an ACTIVE staff member with no working staff key under the site's current name enrol one key
 * with password and authenticator code. The API calls four `_v2` entry points beside 0085's, 0086's and 0151's; each
 * takes the permit's case itself and hands every other case to the older function unchanged (the start of a ceremony
 * also refuses, as the older one does, a staff member who comes with a password-and-code receipt and no permit).
 *
 * An `expand` step: one new table and nine new functions, nothing older altered, replaced or revoked, so it amends no
 * earlier step's postcondition. It adds no billing relation or function, so it names the verifier in force (0130's) as
 * its own. Its checks are its postcondition (below), compared on every later migrate(); it has no supplemental verifier,
 * so no replayVerifierSql. Its n1 header (`-- n1: expand`, `-- n1: keeps-verifier`) is read from its SQL by the chain.
 */
const NAME='0184_staff_rekey_permit.sql';
const VERSION='staff-rekey-permit-forward0184-v1';
const MANIFEST_PATH='lineage/staff-rekey-permit-forward0184.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-130.sql';
const PREVIOUS='0182_mfa_recovery_control_user_started.sql';
/** The nine functions the step creates, each digested whole (owner, definer, settings, volatility, definition digest, ACL). */
const FUNCTIONS:readonly string[]=[
 // The two tests the others share: a working staff key under a name, and the permit a sign-in may use now.
 'staff.rekey_key_present(uuid,text,text)',
 'staff.rekey_permit_current(uuid,uuid)',
 // The operator's opening.
 'staff.arm_rekey(uuid,text,text,text)',
 // The password and code check beside 0085's.
 'staff.step_up_prerequisite_v2(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text)',
 // Whether a ceremony the permit started may still finish.
 'staff.rekey_challenge_current(uuid)',
 // The ceremony's start, read and completion beside 0151's and 0086's, and the key row the completion writes.
 'staff.begin_owned_webauthn_v2(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb)',
 'staff.read_owned_webauthn_challenge_v2(uuid,uuid,text,text,jsonb,jsonb,jsonb)',
 'staff.complete_owned_webauthn_registration_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb)',
 'identity.staff_insert_rekey_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz)'
];
/** The one table the step creates, digested whole (owner, ACL, columns, constraints, indexes, triggers, rules, sequence ACL), as 0178 digests its tables. */
const TABLES:readonly string[]=['staff.rekey_permit'];
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0184_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** The nine functions and the table, each whole: a changed body, owner, grant, column, constraint, index or trigger moves the digest. */
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

export async function loadForward0184(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
