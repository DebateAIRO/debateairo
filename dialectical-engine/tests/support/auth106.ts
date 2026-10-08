import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from '@debateai/db';
const hashes:Readonly<Record<string,string>>={
 '0103_password_recovery_t2.sql':'d90e9eaef8ffd4e21f86e99f2f9c669e0cb61897f89da4a8f15f1f1c857e082f',
 '0104_password_only_reset.sql':'3132f6a7cb54c1d89a4a58c0fedf45d426211b79be11659aa5222f1b2521ea89',
 '0105_backup_email_verification.sql':'ddef059bc65ea7654231514b1c307b7c1edf1fd2516284f3d3a828fbc7005eb3',
 '0106_known_password_mfa_recovery.sql':'9ee1d203f6c091c9e0205daae64c588e191942dad2267dfb8963a57baabfa486'
};
export async function seedInstalledAuth106(pool:Pool):Promise<void>{
 const names=JSON.parse(await readFile(new URL('../fixtures/auth106-ledger-names.json',import.meta.url),'utf8')) as string[];
 if(names.length!==106)throw Error('AUTH106_FIXTURE_LEDGER_INVALID');
 await pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY, applied_at timestamptz NOT NULL)');
 for(const name of names){
  const bytes=await readFile(new URL(`../../migrations/${name}`,import.meta.url));
  if(hashes[name]&&createHash('sha256').update(bytes).digest('hex')!==hashes[name])throw Error('AUTH106_FIXTURE_SOURCE_DRIFT');
  await pool.query(bytes.toString('utf8'));
  await pool.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[name]);
 }
}
