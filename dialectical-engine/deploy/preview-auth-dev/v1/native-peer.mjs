import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { refuse, sha256, withPrivateBytes } from './custody.mjs';
const ACTIVE = Object.freeze({ database:'debateai', port:5434, socket:'/run/debateai-v3-preview/postgresql', cluster:'debateai-v3-preview-15fccd74', dataDirectory:'/var/lib/postgresql/18/v3-preview', session:'postgres', role:'debateai_prod_migrator', major:18 });
const FUNCTIONS = Object.freeze(['billing.purge_expired_records(timestamptz)','billing.consume_withdrawal_grant(uuid,uuid,uuid,text)',
  'billing.owner_erasure_pending(uuid)','billing.pending_erasure_owner_refs(uuid,integer)','billing.owner_age_frozen(uuid)','billing.owner_erasure_committed(uuid)']);
/** Exported for synthetic pool-contract tests; no event callback can race a pending query. */
export async function withGuardedPool(pool, guard, operation) {
  const held = new Set(); let closed = false;
  const connect = async () => {
    if (closed) refuse('PREVIEW_NATIVE_POOL_CLOSED');
    const client = await pool.connect();
    try { await guard(client); } catch (error) { client.release(true); throw error; }
    let released = false;
    const release = error => { if (!released) { released = true; held.delete(release); client.release(error); } };
    held.add(release);
    return Object.freeze({ query:(...args) => { if (released) refuse('PREVIEW_NATIVE_CLIENT_RELEASED'); return client.query(...args); }, release });
  };
  const facade = Object.freeze({ connect, async query(...args) { const client = await connect(); try { return await client.query(...args); } finally { client.release(); } } });
  try { return await operation(facade); }
  finally { closed = true; for (const release of held) release(true); await pool.end(); }
}
export async function assertNativeConnection(client, target, auth106Names) {
  const result = await client.query(`SELECT session_user::text session,current_user::text role,current_database() database,
    current_setting('port')::int port,current_setting('cluster_name') cluster,current_setting('data_directory') data_directory,
    (current_setting('server_version_num')::int/10000) major,r.oid::int role_oid,r.rolcanlogin,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolinherit,r.rolbypassrls,
    (SELECT relowner::int FROM pg_class WHERE oid=to_regclass('public.debateai_schema_migration')) ledger_owner,
    (SELECT nspowner::int FROM pg_namespace WHERE nspname='billing') billing_owner,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) memberships
    FROM pg_roles r WHERE r.rolname=current_user`);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row || row.session !== target.session || row.role !== target.role || row.database !== target.database
    || row.port !== target.port || row.cluster !== target.cluster || row.data_directory !== target.dataDirectory || row.major !== 18
    || !Number.isSafeInteger(row.role_oid) || row.role_oid !== row.ledger_owner || row.role_oid !== row.billing_owner
    || [row.rolcanlogin,row.rolsuper,row.rolcreaterole,row.rolcreatedb,row.rolinherit].some(flag=>flag!==true)
    || row.rolbypassrls !== false || row.memberships !== false) refuse('PREVIEW_NATIVE_IDENTITY_REFUSED');
  const owners = (await client.query(`SELECT signature,p.proowner::int owner FROM unnest($1::text[]) signature LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [FUNCTIONS])).rows;
  if (owners.length !== FUNCTIONS.length || owners.some(item=>!FUNCTIONS.includes(item.signature) || (item.owner !== null && item.owner !== row.role_oid))) refuse('PREVIEW_NATIVE_OWNER_REFUSED');
  const missing = owners.filter(item=>item.owner === null).length;
  if (missing) {
    const names = (await client.query('SELECT name FROM public.debateai_schema_migration ORDER BY name')).rows.map(item=>item.name);
    if (missing !== FUNCTIONS.length || names.length !== auth106Names.length || names.some((name,index)=>name!==[...auth106Names].sort()[index])) refuse('PREVIEW_NATIVE_STATE_REFUSED');
  }
  return Object.freeze({ roleOid:row.role_oid, ledgerOwnerOid:row.ledger_owner, billingOwnerOid:row.billing_owner, defaultOwnerCount:FUNCTIONS.length-missing, postgresMajor:row.major });
}
/** Active operator only: caller cannot supply a database, role, arbitrary pool option, or environment. */
export async function withActiveNativePool({ publicPeerModule, auth106Names }, operation) {
  if (process.platform !== 'linux' || process.getuid?.() === 0 || Object.keys(process.env).some(key=>!['PATH','LANG','LC_ALL','TZ'].includes(key))) refuse('PREVIEW_NATIVE_ACTOR_REFUSED');
  const fixed='/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs';
  if (publicPeerModule !== fixed) refuse('PREVIEW_NATIVE_SOURCE_REFUSED');
  await withPrivateBytes(fixed,{root:'/opt/debateai-v3-preview/operator/recovery106-v1',uid:0,mode:[0o644,0o755],maxBytes:262144},bytes=>{if(sha256(bytes)!=='b91079782dd7da3710cc5afced0c5452da8179be97059c6aef6321acd95eea8a')refuse('PREVIEW_NATIVE_SOURCE_REFUSED');});
  const peer = await import(pathToFileURL(fixed).href);
  peer.assertPeerActor106(process.argv.slice(2), process.env);
  const descriptor = peer.readPeerDescriptor106(3);
  if (typeof descriptor !== 'string') refuse('PREVIEW_NATIVE_DESCRIPTOR_REFUSED');
  // The old parser already rejects every alternate endpoint; select the original creator at startup.
  const pool = new pg.Pool({ connectionString:descriptor, options:'-c role=debateai_prod_migrator', max:2, connectionTimeoutMillis:5000 });
  return withGuardedPool(pool, client=>assertNativeConnection(client,ACTIVE,auth106Names), operation);
}
