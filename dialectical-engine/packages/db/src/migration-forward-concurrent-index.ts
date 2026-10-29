import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import type { ForwardStepAnchor, ForwardStepPlan } from './migration-forward-chain.js';
import { parseN1Header } from './migration-n1.js';

/**
 * The shared loader of an outside-transaction chain step (security audit run 3, NV-38; migrations/lineage/README.md
 * "Recovery notice due indexes (0132-0134)"): one SQL file whose n1 header declares `-- n1: expand`,
 * `-- n1: keeps-verifier` and `-- n1: outside-transaction` and whose whole body is ONE
 * `CREATE INDEX CONCURRENTLY IF NOT EXISTS <index> ON <schema>.<table> …` (migration-n1.ts parseN1Header). migrate()
 * builds the index on its session first and then records the step in a step transaction that refuses unless the index
 * is valid and on that table (migration-forward-chain.ts runOutsideTransactionStep, applyForwardStep). The manifest is
 * checked as loadForward0124 checks its own (exact keys, version, recipe, the step before by name, manifest and
 * verifier, the migration's name and digest, the verifier's digest); the step keeps the verifier in force, so its
 * manifest names the verifier of the step before. Its checks are its postcondition, the index row whole (definition,
 * valid, ready, not unique, owner), compared on every later migrate(); no supplemental verifier, so no
 * replayVerifierSql. A step's own loader (migration-forward0132.ts and the next ones) only names its constants.
 */
export type ConcurrentIndexStepSpec=Readonly<{
 name:string; version:string; manifestPath:string; previous:string;
 /** The refusal prefix, for example `MIGRATION_FORWARD0132_`. */
 refusal:string;
 schema:string; table:string; index:string;
}>;
const VERIFIER_PATH=/^lineage\/verify-effective-capabilities(?:-[0-9]{3,4})?\.sql$/;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const exactKeys=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

/** The index row whole, ON the step's own table: a same-named index elsewhere is not the step's. */
const INDEX_EVIDENCE=`SELECT n.nspname||'.'||ic.relname AS index, nt.nspname||'.'||t.relname AS relation, pg_get_indexdef(i.indexrelid) AS definition, i.indisvalid AS valid, i.indisready AS ready, i.indisunique AS "unique", pg_get_userbyid(ic.relowner) AS owner FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_namespace n ON n.oid=ic.relnamespace JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace nt ON nt.oid=t.relnamespace WHERE i.indexrelid=to_regclass($1) AND i.indrelid=to_regclass($2)`;

export async function loadConcurrentIndexStep(spec:ConcurrentIndexStepSpec,anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 const fail=(detail:string):never=>{throw Error(`${spec.refusal}${detail}`);};
 const directory=new URL('../../../migrations/',import.meta.url);
 const bytes=await readFile(new URL(spec.manifestPath,directory));const raw:unknown=JSON.parse(bytes.toString('utf8'));
 if(!exactKeys(raw,['version','baseRecipeSha256','previous','migration','verifier'])||raw.version!==spec.version||raw.baseRecipeSha256!==anchor.baseRecipeSha256
  ||!exactKeys(raw.previous,['name','manifestSha256','verifierSha256'])||raw.previous.name!==spec.previous||anchor.previousName!==spec.previous
  ||raw.previous.manifestSha256!==anchor.previousManifestSha256||raw.previous.verifierSha256!==anchor.previousVerifierSha256
  ||!exactKeys(raw.migration,['name','sha256'])||raw.migration.name!==spec.name||!digest(raw.migration.sha256)
  ||!exactKeys(raw.verifier,['path','sha256'])||typeof raw.verifier.path!=='string'||!VERIFIER_PATH.test(raw.verifier.path)
  ||!digest(raw.verifier.sha256)||raw.verifier.sha256!==anchor.previousVerifierSha256)return fail('MANIFEST');
 const verifierPath=raw.verifier.path,verifierSha256=raw.verifier.sha256;
 const sqlBytes=await readFile(new URL(spec.name,directory));
 if(sha(sqlBytes)!==raw.migration.sha256)return fail('SOURCE_DIGEST');
 const sql=sqlBytes.toString('utf8');
 const declared=parseN1Header(spec.name,sql).concurrentIndex;
 if(declared===null||declared.schema!==spec.schema||declared.table!==spec.table||declared.name!==spec.index)return fail('INDEX_DECLARATION');
 const verifierBytes=await readFile(new URL(verifierPath,directory));
 if(sha(verifierBytes)!==verifierSha256)return fail('VERIFIER_DIGEST');
 async function postconditionEvidence(client:PoolClient):Promise<string>{
  const rows=(await client.query<{valid:boolean;ready:boolean;unique:boolean}>(INDEX_EVIDENCE,[`${spec.schema}.${spec.index}`,`${spec.schema}.${spec.table}`])).rows;
  if(rows.length!==1||rows[0]!.valid!==true||rows[0]!.ready!==true||rows[0]!.unique!==false)return fail('POSTCONDITION_OBJECTS');
  return sha(JSON.stringify({index:rows[0]}));
 }
 return Object.freeze({name:spec.name,version:spec.version,manifestSha256:sha(bytes),sourceSha256:raw.migration.sha256,sql,
  previousName:spec.previous,previousManifestSha256:anchor.previousManifestSha256,previousVerifierSha256:anchor.previousVerifierSha256,
  verifierPath,verifierSha256,verifierSql:verifierBytes.toString('utf8'),postconditionEvidence});
}
