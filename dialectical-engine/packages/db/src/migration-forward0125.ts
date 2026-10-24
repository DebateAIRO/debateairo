import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * The Italy-specific approval (mission italy-clause-approval, slice S01; Italian Civil Code arts. 1341-1342) as the
 * chain step after the settings activation step 0124 (migrations/lineage/README.md): two nullable columns on
 * legal.acceptance (clauses, leg), its kind and version CHECKs widened for ITALY_SPECIFIC_APPROVAL and the new CHECK
 * acceptance_italy_fields, the sign-up writer identity.record_signup_italy_approval(uuid,jsonb) (EXECUTE for the API's
 * debateai_billing_runtime) and the export reader identity.read_data_export_snapshot_v2(uuid,uuid) (EXECUTE for
 * debateai_data_export_worker, owned like 0115's export functions). An `expand` step: it replaces no earlier function,
 * and the release before writes only kinds both CHECK versions accept. It adds no billing relation or function, so it
 * names 0111's effective verifier as its own. The three CHECKs are checked by the closing block and by tests, not
 * digested, so a later step may widen the kind list again without a postcondition drift on 0125. Its checks are its
 * postcondition (below), compared on every later migrate(); it has no supplemental verifier, so no replayVerifierSql.
 * Its n1 header (`-- n1: expand`, `-- n1: keeps-verifier`) is read from its SQL by the chain.
 */
const NAME='0125_italy_specific_approval.sql';
const VERSION='italy-specific-approval-forward0125-v1';
const MANIFEST_PATH='lineage/italy-specific-approval-forward0125.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0125 adds no billing relation or billing function, so it names the verifier in force (0111's, which 0112 to 0125 keep)
const PREVIOUS='0124_settings_activation.sql';
/** §1: the columns 0125 adds, as table.column. */
const COLUMNS=['legal.acceptance.clauses','legal.acceptance.leg'] as const;
/** §5, §6: the two functions 0125 adds, whole (owner, definer, path, volatility, definition digest, ACL). */
const FUNCTIONS=['identity.read_data_export_snapshot_v2(uuid,uuid)','identity.record_signup_italy_approval(uuid,jsonb)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0125_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
/** 'schema.table.name' → ['schema.table','name']. */
const split=(qualified:string):readonly [string,string]=>[qualified.slice(0,qualified.lastIndexOf('.')),qualified.slice(qualified.lastIndexOf('.')+1)];

/**
 * 0125's two columns (type, NOT NULL, default) and its two functions whole (owner, SECURITY DEFINER, search_path,
 * volatility, definition digest and ACL), as 0123 digests its own. Only what 0125 adds: legal.acceptance's other
 * columns and its constraints belong to 0080, 0111 and 0125's closing block.
 */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const columns=(await client.query(`
  SELECT qualified,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value
  FROM unnest($1::text[],$2::text[],$3::text[]) AS wanted(qualified,relation,name)
  JOIN pg_attribute a ON a.attrelid=to_regclass(wanted.relation) AND a.attname=wanted.name AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum ORDER BY qualified`,
  [COLUMNS,COLUMNS.map(name=>split(name)[0]),COLUMNS.map(name=>split(name)[1])])).rows;
 if(columns.length!==COLUMNS.length)return fail('POSTCONDITION_OBJECTS');
 const functions=(await client.query(`
  SELECT signature,pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,p.provolatile volatility,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition,
   (SELECT jsonb_agg(g.item ORDER BY g.item) FROM (SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable::text item FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) g) acl
  FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[FUNCTIONS])).rows;
 if(functions.length!==FUNCTIONS.length)return fail('POSTCONDITION_OBJECTS');
 return sha(JSON.stringify({columns,functions}));
}

export async function loadForward0125(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
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
