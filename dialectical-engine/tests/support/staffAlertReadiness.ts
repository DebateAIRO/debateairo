import { randomUUID } from 'node:crypto';
import type { Pool } from '@debateai/db';
const generations=new WeakMap<Pool,string>();
/** Explicit root-owned publication fixture. Never reads real config or sends mail. */
export async function authorizeStaffAlertFixture(pool:Pool,operationId:string):Promise<void>{
 let generation=generations.get(pool);if(!generation){generation=randomUUID();generations.set(pool,generation);}
 await pool.query(`INSERT INTO staff.independent_alert_readiness(singleton,config_sha256,generation,ack_adapter_id,rehearsal_id,published_at,valid_until) VALUES(true,$1,$2,'fixture-only',$3,statement_timestamp(),statement_timestamp()+interval '30 seconds') ON CONFLICT(singleton) DO UPDATE SET config_sha256=EXCLUDED.config_sha256,generation=EXCLUDED.generation,ack_adapter_id=EXCLUDED.ack_adapter_id,rehearsal_id=EXCLUDED.rehearsal_id,published_at=EXCLUDED.published_at,valid_until=EXCLUDED.valid_until`,['f'.repeat(64),generation,randomUUID()]);
 await pool.query('SELECT staff.authorize_alert_operation($1,$2,$3)',[operationId,'f'.repeat(64),generation]);
}
