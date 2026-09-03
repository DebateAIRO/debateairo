import type { Pool } from "pg";
import type { SampleIntent } from "../core/types.js";

const ONE_DAY_MS = 86_400_000;

export class SampleRingStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async write(sample: SampleIntent, cadenceMs: number): Promise<void> {
    const capacity = Math.max(1, Math.ceil(ONE_DAY_MS / cadenceMs));
    const bucket = Math.floor(sample.observedAt.getTime() / cadenceMs) % capacity;
    const client = await this.pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(
        `INSERT INTO observation.sample_ring(metric_key,bucket,observed_at,value)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (metric_key,bucket) DO UPDATE SET
           observed_at=EXCLUDED.observed_at,value=EXCLUDED.value`,
        [sample.metricKey, bucket, sample.observedAt, sample.value]
      );
    } finally {
      client.release();
    }
  }
}
