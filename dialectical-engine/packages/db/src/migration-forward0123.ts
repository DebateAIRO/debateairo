import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';

/**
 * Side-by-side releases (spec 2026-10-21 §1, §5; plan A, tasks A1-A5) as the chain step after engine 2's map answer step
 * 0122 (migrations/lineage/README.md): the transition release T's one migration, built section by section. §1 stamps
 * every run with its release (core.run.release_key and its CHECK run_release_key_shape); §2 redefines
 * core.create_encrypted_run(jsonb,uuid,uuid,jsonb) in place (0072's body plus the stamp) so the encrypted insert path
 * writes it. It adds no billing relation and no billing function, so the effective verifier in force (0111's) stays in
 * force and is named as its own. Its checks are its postcondition (below), compared on every later migrate(); it has no
 * supplemental verifier, so no replayVerifierSql. Each later section appends its objects to the lists below.
 */
const NAME='0123_side_by_side_releases.sql';
const VERSION='side-by-side-releases-forward0123-v1';
const MANIFEST_PATH='lineage/side-by-side-releases-forward0123.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql'; // README step 3: 0123 adds no billing relation or billing function, so it names the verifier in force (0111's, which 0112 to 0123 keep)
const PREVIOUS='0122_engine_map_check.sql';
/** §1: the column 0123 adds, as table.column. */
const COLUMNS=['core.run.release_key'] as const;
/** §1: the CHECKs 0123 adds, as table.constraint. */
const CONSTRAINTS=['core.run.run_release_key_shape'] as const;
/** §2: the functions 0123 redefines in place (whole: owner, definer, path, volatility, definition, ACL). */
const FUNCTIONS=['core.create_encrypted_run(jsonb,uuid,uuid,jsonb)'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0123_${detail}`);};
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
/** 'schema.table.name' → ['schema.table','name']. */
const split=(qualified:string):readonly [string,string]=>[qualified.slice(0,qualified.lastIndexOf('.')),qualified.slice(qualified.lastIndexOf('.')+1)];

/**
 * 0123's columns (type, NOT NULL, default), its CHECKs by name, validation and definition, and the functions it redefines
 * (owner, SECURITY DEFINER, search_path, volatility, definition digest and ACL), as 0120 digests its own. Only what 0123
 * adds or redefines: core.run's other columns and constraints belong to earlier files.
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
 return sha(JSON.stringify({columns,constraints,functions}));
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
