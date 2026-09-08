import pg from "pg";

const ROLE = "debateai_obs_listener" as const;

export interface DaemonHeartbeat {
  refresh(): Promise<void>;
  close(): Promise<void>;
}

export function createDaemonHeartbeat(databaseUrl: string): DaemonHeartbeat {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  return Object.freeze({
    async refresh(): Promise<void> {
      const client = await pool.connect();
      try {
        const identity = await client.query<{ current_user: string }>("SELECT current_user");
        if (identity.rows[0]?.current_user !== ROLE) throw new TypeError("FIX09_DAEMON_ROLE");
        await client.query(`
          INSERT INTO obs.component_health(component,state,observed_at,detail_code)
          VALUES ('fixagent-daemon','PASS',statement_timestamp(),'NONE')
          ON CONFLICT (component) DO UPDATE SET state='PASS',observed_at=EXCLUDED.observed_at,
            detail_code='NONE',updated_at=statement_timestamp()`);
      } finally {
        client.release();
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  });
}
