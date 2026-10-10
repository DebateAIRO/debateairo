import type { Pool } from '@debateai/db';
import { loadMigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { applyForward108 } from '../../packages/db/src/migration-forward108.js';
import { applyForward110 } from '../../packages/db/src/migration-forward110.js';

/**
 * A database as dev at dedbb2d50 leaves it (PR-54, task N26n): every source of dev's sealed recipe executed in the
 * recipe's order and recorded in the original ledger (the integrated-original lineage of
 * tests/integration/auth-dev-lineage.test.ts), dev's sealed effective-capability verifier, then 0108 through dev's own
 * applyForward108, which writes its ledger row and its private receipt. No forward step after 0108 runs here; the next
 * migrate() of this branch applies dev's 0110, then 0111 on top.
 */
export async function seedDevLineage108(pool:Pool):Promise<void>{
 await seedDevLineage(pool,false);
}

/**
 * A database as dev at 20dafdd87 leaves it (PR-58, task F10): seedDevLineage108's state, then 0110 through dev's own
 * applyForward110 in the same transaction, as dev's migrate() runs it after 0108. The next migrate() of this branch
 * applies 0111 on top.
 */
export async function seedDevLineage110(pool:Pool):Promise<void>{
 await seedDevLineage(pool,true);
}

async function seedDevLineage(pool:Pool,with110:boolean):Promise<void>{
 const plan=await loadMigrationPlan();
 // As the old runners did: one source at a time (0025 and 0029 carry their own BEGIN/COMMIT).
 await pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY CHECK (length(btrim(name)) > 0), applied_at timestamptz NOT NULL)');
 for(const name of plan.manifest.order){
  await pool.query(plan.sources.get(name)!.sql);
  await pool.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[name]);
 }
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query(plan.effectiveCapabilityVerifierSql);
  await applyForward108(client,plan,'integrated-original',new Set(plan.manifest.order));
  if(with110)await applyForward110(client,plan,'integrated-original',new Set([...plan.manifest.order,plan.forward108.name]));
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
